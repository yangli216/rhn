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
                .andExpect(jsonPath("$.mediaProfiles.length()").value(7))
                .andExpect(jsonPath("$.mediaProfiles[*].mediaCode", org.hamcrest.Matchers.hasItems(
                        "A4_PORTRAIT", "A5_PORTRAIT", "THERMAL_80_CONTINUOUS", "LABEL_70X50",
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
