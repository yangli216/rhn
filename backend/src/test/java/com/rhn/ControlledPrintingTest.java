package com.rhn;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
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
    @Autowired JdbcTemplate jdbcTemplate;

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
                documents.get(0).get("contentSchema").asText());
        String documentId = documents.get(0).get("id").asText();

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
                .andExpect(jsonPath("$.templateCode").value("OUTPATIENT_NOTE_A4"))
                .andExpect(jsonPath("$.contentDigest").value(org.hamcrest.Matchers.matchesPattern("[0-9A-F]{64}")))
                .andReturn().getResponse().getContentAsString());
        byte[] notePdf = download(noteReceipt);
        assertPdf(notePdf);

        JsonNode reprint = json(mockMvc.perform(post("/api/platform/printing/jobs/{id}/reprints",
                                noteReceipt.get("jobId").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"copies\":2}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requestType").value("REPRINT"))
                .andExpect(jsonPath("$.copies").value(2))
                .andReturn().getResponse().getContentAsString());
        assertEquals(noteReceipt.get("outputId").asText(), reprint.get("outputId").asText());
        assertEquals(noteReceipt.get("jobId").asText(), reprint.get("originalJobId").asText());
        assertArrayEquals(notePdf, download(reprint));

        JsonNode medication = createMedication(suffix);
        JsonNode prescription = json(mockMvc.perform(post("/api/encounters/{id}/prescriptions", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"categoryCode\":\"OUTPATIENT\",\"note\":\"控制血压\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String prescriptionId = prescription.get("id").asText();
        mockMvc.perform(post("/api/encounters/{encounterId}/prescriptions/{prescriptionId}/print-jobs",
                                encounterId, prescriptionId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"PATIENT_COPY\",\"copies\":1}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PRINT_SOURCE_NOT_FINAL"));
        mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"prescriptionId":"%s","medicationId":"%s","quantity":14,"quantityUnit":"片",
                                 "doseValue":10,"doseUnit":"mg","routeCode":"PO","frequencyCode":"QD",
                                 "substitutionAllowed":true,"selfProvided":false,"allergyReviewConfirmed":true,
                                 "medicationInstruction":"每日一次"}
                                """.formatted(prescriptionId, medication.get("id").asText())))
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
                .andReturn().getResponse().getContentAsString());
        assertPdf(download(prescriptionReceipt));

        JsonNode printRecords = json(mockMvc.perform(get("/api/platform/printing/records")
                        .param("encounterId", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertEquals(2, printRecords.size());
        JsonNode noteRecord = java.util.stream.StreamSupport.stream(printRecords.spliterator(), false)
                .filter(item -> "OUTPATIENT_NOTE".equals(item.get("documentType").asText()))
                .findFirst().orElseThrow();
        assertEquals(documentId, noteRecord.get("sourceId").asText());
        assertEquals("PATIENT_COPY", noteRecord.get("purpose").asText());
        assertEquals(noteReceipt.get("contentDigest").asText(), noteRecord.get("contentDigest").asText());
        assertEquals(2, noteRecord.get("jobs").size());
        assertEquals("REPRINT", noteRecord.get("jobs").get(0).get("requestType").asText());
        assertEquals(noteReceipt.get("outputId").asText(), noteRecord.get("outputId").asText());
        assertArrayEquals(notePdf, download(noteRecord));

        mockMvc.perform(get("/api/platform/printing/templates").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].scope").value("PLATFORM"));
        assertEquals(3, jdbcTemplate.queryForObject("select count(*) from print_jobs where tenant_id = ?", Integer.class,
                Long.valueOf(TENANT)));
        assertEquals(2, jdbcTemplate.queryForObject("select count(*) from print_outputs where tenant_id = ?", Integer.class,
                Long.valueOf(TENANT)));
    }

    private byte[] download(JsonNode receipt) throws Exception {
        MvcResult result = mockMvc.perform(get(receipt.get("downloadUrl").asText()).with(rhnWorkContext()))
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
                                {"fullName":"打印测试居民","nationalId":"%s","gender":"FEMALE","birthDate":"1990-01-01"}
                                """.formatted(nationalId)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private String createActiveEncounter(String residentId) throws Exception {
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String encounterId = encounter.get("id").asText();
        mockMvc.perform(verifiedEncounterStart(encounterId))
                .andExpect(status().isOk());
        return encounterId;
    }

    private JsonNode createMedication(String suffix) throws Exception {
        return json(mockMvc.perform(post("/api/platform/master-data/medications").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"PRINT-MED-%s","name":"苯磺酸氨氯地平片","aliasName":"氨氯地平",
                                 "sdMedicationType":"WESTERN","sdDoseForm":"TABLET","preparationSpec":"10mg",
                                 "preparationUnit":"片","strengthValue":10,"strengthUnit":"mg",
                                 "sdStorageType":"ROOM_TEMPERATURE","prescriptionDrug":true,"essentialDrug":false,
                                 "antimicrobial":false,"skinTestRequired":false,"defaultDose":10,
                                 "defaultDoseUnit":"mg","defaultRoute":"PO","defaultFrequency":"QD",
                                 "chronicDiseaseDrug":true,"singleOrder":false,"sdStatus":"ACTIVE"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }
}
