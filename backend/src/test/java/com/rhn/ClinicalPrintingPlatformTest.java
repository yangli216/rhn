package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ClinicalPrintingPlatformTest extends RhnIntegrationTestSupport {

    @Test
    void manages_validates_previews_and_publishes_a_canvas_template() throws Exception {
        JsonNode catalog = json(mockMvc.perform(get("/api/platform/printing/administration/catalog")
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.documentDefinitions.length()").value(9))
                .andExpect(jsonPath("$.mediaProfiles.length()").value(8))
                .andExpect(jsonPath("$.mediaProfiles[*].mediaCode", org.hamcrest.Matchers.hasItems(
                        "A4_PORTRAIT", "A5_PORTRAIT", "A5_LANDSCAPE", "THERMAL_80_CONTINUOUS", "LABEL_70X50",
                        "A4_LABEL_70X50_8_UP", "A5_LABEL_70X50_3_UP")))
                .andReturn().getResponse().getContentAsString());
        JsonNode definition = find(catalog.get("documentDefinitions"), "documentType", "ORAL_MEDICATION_CARD");
        JsonNode media = find(catalog.get("mediaProfiles"), "mediaCode", "THERMAL_80_CONTINUOUS");
        String code = "TEST_ORAL_CARD_" + UUID.randomUUID().toString().substring(0, 8).replace("-", "").toUpperCase();
        String config = """
                {"paper":{"widthMm":80,"heightMm":55},"elements":[
                  {"type":"text","xMm":2,"yMm":2,"widthMm":76,"heightMm":8,"text":"口服药卡","fontSize":13,"bold":true,"align":"CENTER"},
                  {"type":"text","xMm":2,"yMm":12,"widthMm":76,"heightMm":12,"template":"{{patientName}}  {{medicationName}}","fontSize":10,"border":true},
                  {"type":"barcode","xMm":46,"yMm":36,"widthMm":31,"heightMm":14,"path":"barcode","showText":true}
                ]}
                """;
        JsonNode created = json(mockMvc.perform(post("/api/platform/printing/administration/drafts")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of(
                                "documentDefinitionId", definition.get("id").asString(),
                                "mediaProfileId", media.get("id").asString(), "templateCode", code,
                                "templateName", "测试口服药卡", "layoutSchema", "RHN_PRINT_CANVAS_V1",
                                "configJson", config))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DRAFT"))
                .andReturn().getResponse().getContentAsString());
        String draftId = created.get("id").asString();

        MvcResult preview = mockMvc.perform(post("/api/platform/printing/administration/drafts/{id}/preview", draftId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sampleData\":{\"patientName\":\"张晓宁\",\"medicationName\":\"阿莫西林胶囊\",\"barcode\":\"RX20260912001\"}}"))
                .andExpect(status().isOk()).andExpect(content().contentType("application/pdf"))
                .andReturn();
        byte[] pdf = preview.getResponse().getContentAsByteArray();
        assertTrue(pdf.length > 1000);
        assertEquals("%PDF-", new String(pdf, 0, 5, StandardCharsets.US_ASCII));

        JsonNode updated = update(draftId, 0, definition, media, config, status().isOk());
        assertEquals(1, updated.get("revision").asInt());
        update(draftId, 0, definition, media, config, status().isConflict());

        JsonNode review = transition(draftId, "submit", 1, "IN_REVIEW");
        JsonNode rejected = transition(draftId, "reject", review.get("revision").asInt(), "REJECTED");
        JsonNode revised = update(draftId, rejected.get("revision").asInt(), definition, media, config, status().isOk());
        review = transition(draftId, "submit", revised.get("revision").asInt(), "IN_REVIEW");
        JsonNode published = transition(draftId, "publish", review.get("revision").asInt(), "PUBLISHED");
        assertNotNull(published.get("templateId"));
        assertNotNull(published.get("publishedVersionId"));

        mockMvc.perform(get("/api/platform/printing/templates").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.templateCode == '%s')].scope".formatted(code)).value("TENANT"))
                .andExpect(jsonPath("$[?(@.templateCode == '%s')].currentVersion".formatted(code)).value(1));

        MvcResult publishedPreview = mockMvc.perform(post(
                        "/api/platform/printing/administration/templates/{id}/preview",
                        published.get("templateId").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sampleData\":{\"patientName\":\"张晓宁\",\"medicationName\":\"阿莫西林胶囊\",\"barcode\":\"RX20260912001\"}}"))
                .andExpect(status().isOk()).andExpect(content().contentType("application/pdf"))
                .andReturn();
        assertTrue(publishedPreview.getResponse().getContentAsByteArray().length > 1000);
        assertEquals("%PDF-", new String(publishedPreview.getResponse().getContentAsByteArray(),
                0, 5, StandardCharsets.US_ASCII));

        JsonNode business = json(mockMvc.perform(get("/api/platform/printing/administration/business")
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tasks.length()").value(9))
                .andExpect(jsonPath("$.organizationName").isNotEmpty())
                .andReturn().getResponse().getContentAsString());
        JsonNode task = find(business.get("tasks"), "taskCode", "TREATMENT.ORAL_MEDICATION_CARD.PRINT");
        JsonNode implementation = find(business.get("implementations"), "templateCode", code);
        mockMvc.perform(post("/api/platform/printing/administration/business/bindings")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of(
                                "expectedRevision", 0, "taskDefinitionId", task.get("id").asString(),
                                "scopeType", "ORGANIZATION", "purpose", "*",
                                "implementationId", implementation.get("id").asString(),
                                "fallbackPolicy", "FAIL_CLOSED"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scopeType").value("ORGANIZATION"));
        mockMvc.perform(get("/api/platform/printing/administration/business/resolution")
                        .param("taskCode", task.get("taskCode").asString()).param("purpose", "CLINICAL_USE")
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.implementation.implementationCode").value(
                        implementation.get("implementationCode").asString()))
                .andExpect(jsonPath("$.binding.scopeType").value("ORGANIZATION"))
                .andExpect(jsonPath("$.trace[?(@.selected == true)].scopeType").value("ORGANIZATION"));
    }

    @Test
    void previews_published_a5_landscape_clinical_templates() throws Exception {
        JsonNode templates = json(mockMvc.perform(get("/api/platform/printing/templates").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.templateCode == 'OUTPATIENT_NOTE_A5')].templateName").value("门诊病历 A5 标准模板"))
                .andExpect(jsonPath("$[?(@.templateCode == 'OUTPATIENT_PRESCRIPTION_A5')].templateName").value("门诊处方 A5 标准模板"))
                .andReturn().getResponse().getContentAsString());

        JsonNode noteTemplate = find(templates, "templateCode", "OUTPATIENT_NOTE_A5");
        String noteSample = """
                {"sampleData":{
                  "organizationName":"仁和医院",
                  "resident":{"fullName":"张晓宁","gender":"女","birthDate":"1980-03-12","healthRecordNo":"HR20260912001"},
                  "encounterNo":"JZ20260912001","departmentName":"全科门诊","insuranceType":"自费/医保",
                  "signedBy":"陈医生","signedAt":"2026-09-12 10:20",
                  "content":{
                    "chiefComplaint":"发热、咽痛三天",
                    "presentIllness":"三天前无明显诱因出现发热。",
                    "pastHistory":"否认重大疾病史。","allergyHistory":"青霉素过敏",
                    "physicalExam":"T 38.2℃，咽部充血。","diagnosis":"急性上呼吸道感染",
                    "treatmentPlan":"对症治疗，复诊随访。"
                  }
                }}
                """;
        MvcResult notePreview = mockMvc.perform(post(
                        "/api/platform/printing/administration/templates/{id}/preview",
                        noteTemplate.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(noteSample))
                .andExpect(status().isOk()).andExpect(content().contentType("application/pdf"))
                .andReturn();
        byte[] notePdf = notePreview.getResponse().getContentAsByteArray();
        assertTrue(notePdf.length > 1000);
        assertEquals("%PDF-", new String(notePdf, 0, 5, StandardCharsets.US_ASCII));

        JsonNode rxTemplate = find(templates, "templateCode", "OUTPATIENT_PRESCRIPTION_A5");
        String westernRxSample = """
                {"sampleData":{
                  "organizationName":"仁和医院",
                  "resident":{"fullName":"张晓宁","gender":"女","birthDate":"1980-03-12","healthRecordNo":"HR20260912001"},
                  "departmentName":"全科门诊","prescriptionNo":"CF20260912001","authoredBy":"陈医生","authoredAt":"2026-09-12 10:12",
                  "diagnosis":"急性上呼吸道感染",
                  "medications":[{
                    "medicationName":"阿莫西林胶囊","specification":"0.25g×24粒","quantity":"2","quantityUnit":"盒",
                    "doseValue":"0.5","doseUnit":"g","routeCode":"PO","frequencyCode":"TID","instruction":"饭后服用"
                  }]
                }}
                """;
        MvcResult westernPreview = mockMvc.perform(post(
                        "/api/platform/printing/administration/templates/{id}/preview",
                        rxTemplate.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(westernRxSample))
                .andExpect(status().isOk()).andExpect(content().contentType("application/pdf"))
                .andReturn();
        byte[] westernPdf = westernPreview.getResponse().getContentAsByteArray();
        assertTrue(westernPdf.length > 1000);
        assertEquals("%PDF-", new String(westernPdf, 0, 5, StandardCharsets.US_ASCII));

        String herbalRxSample = """
                {"sampleData":{
                  "organizationName":"仁和医院",
                  "title":"中药饮片处方笺",
                  "categoryCode":"HERBAL",
                  "resident":{"fullName":"张晓宁","gender":"女","birthDate":"1980-03-12","healthRecordNo":"HR20260912001"},
                  "departmentName":"中医门诊","prescriptionNo":"CY20260912008","authoredBy":"李中医师","authoredAt":"2026-09-12 10:15",
                  "durationValue":7,"durationUnit":"剂","frequencyName":"每日一次","instruction":"水煎服，每日一剂，分早晚两次温服",
                  "note":"门诊草药专方：疏风宣肺，清热解表",
                  "diagnoses":[{"code":"BNP010","display":"风热犯肺证","type":"PRIMARY"}],
                  "medications":[
                    {"medicationName":"金银花","specification":"饮片","quantity":"10","quantityUnit":"g","instruction":"后下"},
                    {"medicationName":"连翘","specification":"饮片","quantity":"10","quantityUnit":"g","instruction":""},
                    {"medicationName":"薄荷","specification":"饮片","quantity":"6","quantityUnit":"g","instruction":"后下"},
                    {"medicationName":"甘草","specification":"饮片","quantity":"6","quantityUnit":"g","instruction":""}
                  ]
                }}
                """;
        MvcResult herbalPreview = mockMvc.perform(post(
                        "/api/platform/printing/administration/templates/{id}/preview",
                        rxTemplate.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(herbalRxSample))
                .andExpect(status().isOk()).andExpect(content().contentType("application/pdf"))
                .andReturn();
        byte[] herbalPdf = herbalPreview.getResponse().getContentAsByteArray();
        assertTrue(herbalPdf.length > 1000);
        assertEquals("%PDF-", new String(herbalPdf, 0, 5, StandardCharsets.US_ASCII));
    }

    private JsonNode update(String draftId, int revision, JsonNode definition, JsonNode media, String config,
                            org.springframework.test.web.servlet.ResultMatcher expectedStatus) throws Exception {
        MvcResult result = mockMvc.perform(put("/api/platform/printing/administration/drafts/{id}", draftId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of(
                                "expectedRevision", revision, "documentDefinitionId", definition.get("id").asString(),
                                "mediaProfileId", media.get("id").asString(), "templateName", "测试口服药卡 V2",
                                "layoutSchema", "RHN_PRINT_CANVAS_V1", "configJson", config))))
                .andExpect(expectedStatus).andReturn();
        return result.getResponse().getContentAsString().isBlank()
                ? objectMapper.createObjectNode() : json(result.getResponse().getContentAsString());
    }

    private JsonNode transition(String draftId, String action, int revision, String expectedStatus) throws Exception {
        return json(mockMvc.perform(post("/api/platform/printing/administration/drafts/{id}/{action}", draftId, action)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":" + revision + "}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value(expectedStatus))
                .andReturn().getResponse().getContentAsString());
    }

    private JsonNode find(JsonNode values, String field, String expected) {
        for (JsonNode value : values) if (expected.equals(value.get(field).asString())) return value;
        throw new AssertionError("Missing catalog value " + expected);
    }
}
