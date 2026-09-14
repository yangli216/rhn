package com.rhn;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("outpatient-main-flow")
class ControlledPrintingTest extends RhnIntegrationTestSupport {
    private static final String MEDICATION_ID = "362387869795203";
    private static final String PRODUCT_ID = "362387869795113";
    private static final String PACKAGE_ID = "362387869795403";
    private static final String LABORATORY_SERVICE_ID = "362387869795101";

    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void standard_task_endpoint_is_idempotent_and_hides_print_implementation_details() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String residentId = createResident(suffix);
        String encounterId = createActiveEncounter(residentId);
        String documentId = createAndSignDocument(residentId, encounterId, "OUTPATIENT_NOTE",
                "门诊病历", "标准打印任务测试");
        String idempotencyKey = "PRINT-TASK-" + suffix;
        String request = """
                {"taskCode":"OP.MEDICAL_RECORD.PRINT",
                 "source":{"sourceType":"ClinicalDocument","sourceId":"%s","encounterId":"%s"},
                 "purpose":"PATIENT_COPY","copies":1,"idempotencyKey":"%s"}
                """.formatted(documentId, encounterId, idempotencyKey);
        JsonNode first = json(mockMvc.perform(post("/api/platform/printing/tasks").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.taskCode").value("OP.MEDICAL_RECORD.PRINT"))
                .andExpect(jsonPath("$.implementationCode").value("PLATFORM_OUTPATIENT_NOTE"))
                .andReturn().getResponse().getContentAsString());
        JsonNode replay = json(mockMvc.perform(post("/api/platform/printing/tasks").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        assertEquals(first.get("jobId").asString(), replay.get("jobId").asString());
        assertEquals(first.get("outputId").asString(), replay.get("outputId").asString());
    }

    @Test
    void signed_note_and_active_prescription_generate_immutable_pdf_and_reprint_audit() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String residentId = createResident(suffix);
        String encounterId = createActiveEncounter(residentId);

        mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"chiefComplaint":"反复头晕一周","presentIllness":"近期家庭血压偏高",
                                 "medicalHistory":"高血压病史三年","physicalExam":"心肺未见明显异常",
                                 "treatmentPlan":"继续监测血压并评估用药","systolic":146,"diastolic":91,
                                 "noteFormVersionId":"362387869799930","structuredData":{
                                   "homeSystolic":142,"homeDiastolic":88,"medicationAdherence":"GOOD",
                                   "adverseEffects":"无","smoking":false,"saltIntake":"MODERATE"},
                                 "diagnoses":[{"code":"I10","display":"原发性高血压","type":"PRIMARY"}]}
                                """))
                .andExpect(status().isOk());
        JsonNode documents = json(mockMvc.perform(get("/api/clinical-documents")
                        .param("encounterId", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        org.junit.jupiter.api.Assertions.assertEquals("RHN.OUTPATIENT_NOTE.V3",
                documents.get(0).get("contentSchema").asString());
        String documentId = documents.get(0).get("id").asString();

        mockMvc.perform(post("/api/clinical-documents/{id}/print-jobs", documentId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"PATIENT_COPY\",\"copies\":1}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PRINT_SOURCE_NOT_FINAL"));
        mockMvc.perform(post("/api/clinical-documents/{id}/sign", documentId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedCurrentVersion\":1,\"signatureMeaning\":\"AUTHOR\"}"))
                .andExpect(status().isOk());

        JsonNode noteReceipt = json(mockMvc.perform(post("/api/clinical-documents/{id}/print-jobs", documentId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"PATIENT_COPY\",\"copies\":1}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("GENERATED"))
                .andExpect(jsonPath("$.taskCode").value("OP.MEDICAL_RECORD.PRINT"))
                .andExpect(jsonPath("$.implementationScope").value("PLATFORM"))
                .andExpect(jsonPath("$.payloadSchema").value("RHN.PRINT.OUTPATIENT_NOTE.V1"))
                .andExpect(jsonPath("$.templateCode").value("OUTPATIENT_NOTE_A4"))
                .andExpect(jsonPath("$.delivery.channel").value("BROWSER_PDF"))
                .andExpect(jsonPath("$.delivery.status").value("SENT"))
                .andExpect(jsonPath("$.contentDigest").value(org.hamcrest.Matchers.matchesPattern("[0-9A-F]{64}")))
                .andReturn().getResponse().getContentAsString());
        byte[] notePdf = download(noteReceipt);
        assertPdf(notePdf);

        JsonNode reprint = json(mockMvc.perform(post("/api/platform/printing/jobs/{id}/reprints",
                                noteReceipt.get("jobId").asString()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"copies\":2}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requestType").value("REPRINT"))
                .andExpect(jsonPath("$.copies").value(2))
                .andExpect(jsonPath("$.implementationCode").value("PLATFORM_OUTPATIENT_NOTE"))
                .andExpect(jsonPath("$.implementationScope").value("PLATFORM"))
                .andExpect(jsonPath("$.delivery.status").value("SENT"))
                .andReturn().getResponse().getContentAsString());
        assertEquals(noteReceipt.get("outputId").asString(), reprint.get("outputId").asString());
        assertEquals(noteReceipt.get("jobId").asString(), reprint.get("originalJobId").asString());
        assertArrayEquals(notePdf, download(reprint));

        createPharmacyWithStock(suffix, 30);
        JsonNode prescription = json(mockMvc.perform(post("/api/encounters/{id}/prescriptions", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"categoryCode\":\"OUTPATIENT\",\"note\":\"控制血压\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String prescriptionId = prescription.get("id").asString();
        mockMvc.perform(post("/api/encounters/{encounterId}/prescriptions/{prescriptionId}/print-jobs",
                                encounterId, prescriptionId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"PATIENT_COPY\",\"copies\":1}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PRINT_SOURCE_NOT_FINAL"));
        mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"prescriptionId":"%s","medicationId":"%s","catalogItemId":"%s","packageId":"%s",
                                 "quantity":1,"quantityUnit":"BOX",
                                 "doseValue":10,"doseUnit":"mg","routeCode":"PO","frequencyCode":"QD",
                                 "substitutionAllowed":true,"selfProvided":false,"allergyReviewConfirmed":true,
                                 "medicationInstruction":"每日一次"}
                                """.formatted(prescriptionId, MEDICATION_ID, PRODUCT_ID, PACKAGE_ID)))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/encounters/{encounterId}/prescriptions/{prescriptionId}/submit",
                                encounterId, prescriptionId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":0}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"));

        JsonNode prescriptionReceipt = json(mockMvc.perform(post(
                                "/api/encounters/{encounterId}/prescriptions/{prescriptionId}/print-jobs",
                                encounterId, prescriptionId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"PATIENT_COPY\",\"copies\":1}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.templateCode").value("OUTPATIENT_PRESCRIPTION_A4"))
                .andExpect(jsonPath("$.taskCode").value("OP.PRESCRIPTION.WESTERN.PRINT"))
                .andExpect(jsonPath("$.delivery.deviceName").value("全科门诊浏览器 PDF"))
                .andReturn().getResponse().getContentAsString());
        assertPdf(download(prescriptionReceipt));

        JsonNode serviceRequest = json(mockMvc.perform(post("/api/encounters/{id}/service-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","quantity":1,"priceType":"SALE","pricingRequired":true,
                                 "reason":"评估感染指标","clinicalDescription":"发热伴乏力，申请血细胞分析"}
                                """.formatted(LABORATORY_SERVICE_ID)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.revision").value(0))
                .andReturn().getResponse().getContentAsString());
        String serviceRequestId = serviceRequest.get("id").asString();
        JsonNode applicationPrinter = json(mockMvc.perform(post("/api/platform/printing/devices")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of(
                                "expectedRevision", 0, "deviceCode", "APPLICATION-" + suffix,
                                "deviceName", "申请单测试打印机", "channel", "LOCAL_BRIDGE",
                                "outputLanguage", "PDF", "queueName", "TEST-APPLICATION",
                                "capabilitiesJson", "{\"mediaCodes\":[\"A4_PORTRAIT\"]}"))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/platform/printing/device-bindings").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":0,"documentType":"LABORATORY_APPLICATION",
                                 "mediaProfileId":"270000000000201","deviceId":"%s"}
                                """.formatted(applicationPrinter.get("id").asString())))
                .andExpect(status().isOk());
        JsonNode applicationReceipt = json(mockMvc.perform(post(
                                "/api/encounters/{encounterId}/service-requests/{requestId}/print-jobs",
                                encounterId, serviceRequestId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"CLINICAL_USE\",\"copies\":1}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.documentType").value("LABORATORY_APPLICATION"))
                .andExpect(jsonPath("$.taskCode").value("OP.APPLICATION.LAB.PRINT"))
                .andExpect(jsonPath("$.templateCode").value("LABORATORY_APPLICATION_A4"))
                .andExpect(jsonPath("$.delivery.channel").value("LOCAL_BRIDGE"))
                .andExpect(jsonPath("$.delivery.status").value("QUEUED"))
                .andReturn().getResponse().getContentAsString());
        assertPdf(download(applicationReceipt));
        JsonNode applicationBridgeJob = json(mockMvc.perform(post(
                                "/api/platform/printing/bridge/devices/{code}/jobs/claim",
                                applicationPrinter.get("deviceCode").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.batchId").doesNotExist())
                .andExpect(jsonPath("$.outputLanguage").value("PDF"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/platform/printing/bridge/deliveries/{id}/acknowledgements",
                        applicationBridgeJob.get("deliveryId").asString()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"status":"DEVICE_CONFIRMED"}
                                """.formatted(applicationBridgeJob.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DEVICE_CONFIRMED"))
                .andExpect(jsonPath("$.batch").doesNotExist());
        mockMvc.perform(post("/api/encounters/{encounterId}/service-requests/{requestId}/cancel",
                                encounterId, serviceRequestId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":0,\"reason\":\"测试撤销\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        mockMvc.perform(post("/api/encounters/{encounterId}/service-requests/{requestId}/print-jobs",
                                encounterId, serviceRequestId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"CLINICAL_USE\",\"copies\":1}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PRINT_SOURCE_NOT_FINAL"));

        JsonNode printRecords = json(mockMvc.perform(get("/api/platform/printing/records")
                        .param("encounterId", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertEquals(3, printRecords.size());
        JsonNode noteRecord = java.util.stream.StreamSupport.stream(printRecords.spliterator(), false)
                .filter(item -> "OUTPATIENT_NOTE".equals(item.get("documentType").asString()))
                .findFirst().orElseThrow();
        assertEquals(documentId, noteRecord.get("sourceId").asString());
        assertEquals("PATIENT_COPY", noteRecord.get("purpose").asString());
        assertEquals(noteReceipt.get("contentDigest").asString(), noteRecord.get("contentDigest").asString());
        assertEquals(2, noteRecord.get("jobs").size());
        assertEquals("REPRINT", noteRecord.get("jobs").get(0).get("requestType").asString());
        assertEquals(noteReceipt.get("outputId").asString(), noteRecord.get("outputId").asString());
        assertArrayEquals(notePdf, download(noteRecord));

        mockMvc.perform(get("/api/platform/printing/templates").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].templateCode", org.hamcrest.Matchers.hasItems(
                        "OUTPATIENT_NOTE_A4", "OUTPATIENT_PRESCRIPTION_A4", "ORAL_MEDICATION_CARD_80",
                        "INFUSION_LABEL_70X50", "INFUSION_PATROL_A5", "LABORATORY_APPLICATION_A4",
                        "EXAMINATION_APPLICATION_A4", "TREATMENT_APPLICATION_A4")));
        assertEquals(4, jdbcTemplate.queryForObject("select count(*) from RHN_SYS_PRINT_JOB where ID_TNT = ?", Integer.class,
                Long.valueOf(TENANT)));
        assertEquals(3, jdbcTemplate.queryForObject("select count(*) from RHN_SYS_PRINT_OUTPUT where ID_TNT = ?", Integer.class,
                Long.valueOf(TENANT)));
        assertEquals(3, jdbcTemplate.queryForObject("select count(*) from RHN_SYS_PRINT_OUTPUT where ID_TNT = ? and CD_PRINT_TASK is not null and ID_PRINT_IMPL is not null and ID_PRINT_IMPL_BIND is not null", Integer.class,
                Long.valueOf(TENANT)));
        assertEquals(4, jdbcTemplate.queryForObject("select count(*) from RHN_SYS_PRINT_DELIVERY where ID_TNT = ?", Integer.class,
                Long.valueOf(TENANT)));
    }

    private byte[] download(JsonNode receipt) throws Exception {
        MvcResult result = mockMvc.perform(get(receipt.get("downloadUrl").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(content().contentType("application/pdf"))
                .andReturn();
        return result.getResponse().getContentAsByteArray();
    }

    private void assertPdf(byte[] content) {
        assertTrue(content.length > 1000);
        assertEquals("%PDF-", new String(content, 0, 5, StandardCharsets.US_ASCII));
    }

    private String createResident(String suffix) throws Exception {
        String digits = Integer.toUnsignedString(suffix.hashCode()).replace("-", "");
        String nationalId = "33010219900101" + ("0000" + digits).substring(("0000" + digits).length() - 4);
        return json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"打印测试居民","identifiers":[{"system":"9","value":"%s","useType":"SECONDARY"}],"gender":"FEMALE","birthDate":"1990-01-01"}
                                """.formatted(nationalId)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
    }

    private String createActiveEncounter(String residentId) throws Exception {
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String encounterId = encounter.get("id").asString();
        mockMvc.perform(verifiedEncounterStart(encounterId))
                .andExpect(status().isOk());
        return encounterId;
    }

    private void createPharmacyWithStock(String suffix, int baseQuantity) throws Exception {
        JsonNode site = json(mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"organizationId":"%s","departmentId":"%s","code":"PRINT-%s",
                                 "name":"打印测试门诊药房%s","siteType":"PHARMACY","serviceScope":"OUTPATIENT",
                                 "validFrom":"2026-01-01"}
                                """.formatted(ORGANIZATION, DEPARTMENT, suffix, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode item = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{siteId}/stock-items", site.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","packageId":"%s","issuePolicy":"FEFO",
                                 "negativeAllowed":false,"lotRequired":true,"traceRequired":false,
                                 "splitAllowed":true,"coldChain":false,"controlled":false,"highAlert":false}
                                """.formatted(PRODUCT_ID, PACKAGE_ID)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode bin = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{siteId}/stock-bins", site.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"PRINT-PICK-%s","name":"打印测试发药位","binType":"COUNTER",
                                 "stockDefault":"AVAILABLE","receiveAllowed":true,"pickAllowed":true,
                                 "countAllowed":true,"sortOrder":10}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode lot = json(mockMvc.perform(post("/api/pharmacy/stock-items/{stockItemId}/lots", item.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"lotNo":"PRINT-%s","productionDate":"2026-01-01","expiryDate":"2027-12-31",
                                 "manufacturerNameSnapshot":"示例制药企业","qualityStatus":"QUALIFIED"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/pharmacy/inventory/receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"requestCode":"PRINT-RCV-%s","sourceCode":"PRINT-OPEN-%s",
                                 "stockItemId":"%s","stockBinId":"%s","stockLotId":"%s",
                                 "operationQuantity":%d,"unitCost":0.60,"occurredAt":"%s","description":"打印流程测试入库"}
                                """.formatted(suffix, suffix, item.get("id").asString(), bin.get("id").asString(),
                                lot.get("id").asString(), baseQuantity, Instant.now())))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/pharmacy/dispense-routes").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"organizationId":"%s","code":"PRINT-ROUTE-%s","name":"打印测试发药路由",
                                 "careSetting":"OUTPATIENT","sourceDepartmentId":"%s","targetStockSiteId":"%s",
                                 "active":true,"validFrom":"2026-01-01"}
                                """.formatted(ORGANIZATION, suffix, DEPARTMENT, site.get("id").asString())))
                .andExpect(status().isCreated());
    }
}
