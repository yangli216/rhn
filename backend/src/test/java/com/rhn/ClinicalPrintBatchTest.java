package com.rhn;

import org.junit.jupiter.api.Test;
import org.openpdf.text.pdf.PdfReader;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ClinicalPrintBatchTest extends RhnIntegrationTestSupport {
    @Test
    void batch_printing_freezes_snapshot_enforces_reprint_and_completes_bridge_receipt() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String residentId = createResident(suffix);
        String encounterId = startEncounter(residentId);
        recordNoKnownDrugAllergy(residentId, encounterId);
        JsonNode medication = json(mockMvc.perform(post("/api/platform/master-data/medications").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"PRINT-IV-%s","name":"打印闭环氯化钠注射液","sdMedicationType":"WESTERN",
                                 "sdDoseForm":"INJECTION","preparationSpec":"100ml","preparationUnit":"瓶",
                                 "prescriptionDrug":true,"essentialDrug":true,"antimicrobial":false,
                                 "skinTestRequired":false,"defaultDose":100,"defaultDoseUnit":"ml",
                                 "defaultRoute":"IVGTT","defaultFrequency":"QD","chronicDiseaseDrug":false,
                                 "singleOrder":false,"sdStatus":"ACTIVE"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode prescription = json(mockMvc.perform(post("/api/encounters/{id}/prescriptions", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"categoryCode\":\"OUTPATIENT\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode request = json(mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"prescriptionId":"%s","medicationId":"%s","quantity":1,"quantityUnit":"瓶",
                                 "doseValue":100,"doseUnit":"ml","routeCode":"IVGTT","frequencyCode":"QD",
                                 "durationValue":1,"durationUnit":"DAY","substitutionAllowed":true,
                                 "selfProvided":true,"pricingRequired":false,"medicationInstruction":"静脉滴注",
                                 "allergyReviewConfirmed":true}
                                """.formatted(prescription.get("id").asText(), medication.get("id").asText())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/encounters/{encounterId}/prescriptions/{prescriptionId}/submit",
                        encounterId, prescription.get("id").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":0}"))
                .andExpect(status().isOk());

        JsonNode candidates = json(mockMvc.perform(get("/api/platform/printing/batches/candidates")
                        .with(rhnWorkContext()).queryParam("documentType", "INFUSION_LABEL")
                        .queryParam("keyword", suffix))
                .andExpect(status().isOk()).andExpect(jsonPath("$.media.mediaCode").value("LABEL_70X50"))
                .andReturn().getResponse().getContentAsString());
        JsonNode candidate = findCandidate(candidates, encounterId);
        assertTrue(candidate.get("eligible").asBoolean());
        String taskId = candidate.get("sourceId").asText();

        String key = "PRINT-BATCH-" + suffix;
        JsonNode batch = createBatch(taskId, "270000000000301", key, null, status().isOk());
        assertEquals(1, batch.get("includedCount").asInt());
        assertEquals(0, batch.get("excludedCount").asInt());
        assertEquals("GENERATED", batch.get("status").asText());
        byte[] pdf = mockMvc.perform(get(batch.get("downloadUrl").asText()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        assertTrue(pdf.length > 1_000);
        assertEquals(1, new PdfReader(pdf).getNumberOfPages());

        JsonNode sheetCandidates = json(mockMvc.perform(get("/api/platform/printing/batches/candidates")
                        .with(rhnWorkContext()).queryParam("documentType", "INFUSION_LABEL")
                        .queryParam("mediaProfileId", "270000000000206").queryParam("keyword", suffix))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.media.mediaCode").value("A4_LABEL_70X50_8_UP"))
                .andExpect(jsonPath("$.media.columns").value(2)).andExpect(jsonPath("$.media.rows").value(4))
                .andReturn().getResponse().getContentAsString());
        assertTrue(findCandidate(sheetCandidates, encounterId).get("eligible").asBoolean());
        JsonNode sheetBatch = createSheetBatch(taskId, "PRINT-SHEET-" + suffix);
        assertEquals("SHEET_GRID", sheetBatch.get("layoutStrategy").asText());
        assertEquals("A4_LABEL_70X50_8_UP", sheetBatch.get("mediaCode").asText());
        assertEquals(8, sheetBatch.get("startSlot").asInt());
        assertEquals(1, sheetBatch.get("pageCount").asInt());
        assertEquals(1, sheetBatch.at("/items/0/pageNo").asInt());
        assertEquals(8, sheetBatch.at("/items/0/slotNo").asInt());
        byte[] sheetPdf = mockMvc.perform(get(sheetBatch.get("downloadUrl").asText()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        PdfReader sheetReader = new PdfReader(sheetPdf);
        assertEquals(1, sheetReader.getNumberOfPages());
        assertEquals(595.3, sheetReader.getPageSize(1).getWidth(), 1.0);
        assertEquals(841.9, sheetReader.getPageSize(1).getHeight(), 1.0);
        sheetReader.close();

        JsonNode sameBatch = createBatch(taskId, "270000000000301", key, null, status().isOk());
        assertEquals(batch.get("id").asText(), sameBatch.get("id").asText());
        mockMvc.perform(post("/api/platform/printing/batches/{id}/dispatch", batch.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SENT"))
                .andExpect(jsonPath("$.delivery.status").value("SENT"));

        createBatch(taskId, "270000000000301", "PRINT-DUP-" + suffix, null, status().isBadRequest());
        JsonNode device = json(mockMvc.perform(post("/api/platform/printing/devices").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                 {"expectedRevision":0,"deviceCode":"BRIDGE-%s","deviceName":"治疗室标签打印机",
                                 "channel":"LOCAL_BRIDGE","outputLanguage":"PDF","queueName":"TEST-LABEL",
                                 "capabilitiesJson":"{}"}
                                """.formatted(suffix)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(get("/api/platform/printing/device-management").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.devices[*].deviceCode", org.hamcrest.Matchers.hasItem("BRIDGE-" + suffix)))
                .andExpect(jsonPath("$.devices[?(@.deviceCode == 'BRIDGE-" + suffix + "')].status",
                        org.hamcrest.Matchers.hasItem("ACTIVE")));
        JsonNode reprint = createBatch(taskId, device.get("id").asText(), "PRINT-REPRINT-" + suffix,
                "标签被输液液体污染", status().isOk());
        JsonNode queued = json(mockMvc.perform(post("/api/platform/printing/batches/{id}/dispatch",
                        reprint.get("id").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("QUEUED"))
                .andReturn().getResponse().getContentAsString());
        JsonNode bridgeJob = json(mockMvc.perform(post("/api/platform/printing/bridge/devices/{code}/jobs/claim",
                        device.get("deviceCode").asText()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.outputLanguage").value("PDF"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/platform/printing/bridge/deliveries/{id}/acknowledgements",
                        bridgeJob.get("deliveryId").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"status":"DEVICE_CONFIRMED"}
                                """.formatted(bridgeJob.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DEVICE_CONFIRMED"))
                .andExpect(jsonPath("$.delivery.attemptCount").value(1));
        assertEquals(1, queued.get("items").size());
        assertEquals("标签被输液液体污染", queued.at("/items/0/reprintReason").asText());
    }

    private JsonNode createBatch(String taskId, String deviceId, String key, String reason,
                                 org.springframework.test.web.servlet.ResultMatcher expected) throws Exception {
        String reasonJson = reason == null ? "" : ",\"reprintReason\":\"" + reason + "\"";
        var result = mockMvc.perform(post("/api/platform/printing/batches").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"documentType":"INFUSION_LABEL","sourceIds":["%s"],"deviceId":"%s",
                                 "idempotencyKey":"%s","layoutStrategy":"ONE_CARD_PER_PAGE"%s}
                                """.formatted(taskId, deviceId, key, reasonJson)))
                .andExpect(expected).andReturn();
        return result.getResponse().getContentAsString().isBlank()
                ? objectMapper.createObjectNode() : json(result.getResponse().getContentAsString());
    }

    private JsonNode createSheetBatch(String taskId, String key) throws Exception {
        return json(mockMvc.perform(post("/api/platform/printing/batches").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"documentType":"INFUSION_LABEL","sourceIds":["%s"],
                                 "mediaProfileId":"270000000000206","deviceId":"270000000000301",
                                 "idempotencyKey":"%s","layoutStrategy":"SHEET_GRID","startSlot":8}
                                """.formatted(taskId, key)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode findCandidate(JsonNode preparation, String encounterId) {
        for (JsonNode value : preparation.get("candidates")) {
            if (encounterId.equals(value.get("encounterId").asText())) return value;
        }
        throw new AssertionError("未找到打印候选任务");
    }

    private String createResident(String suffix) throws Exception {
        String digits = "%04d".formatted(Math.floorMod(suffix.hashCode(), 10000));
        return json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"打印闭环测试居民","identifiers":[{"system":"9","value":"33010219920808%s","useType":"SECONDARY"}],
                                 "gender":"FEMALE","birthDate":"1992-08-08"}
                                """.formatted(digits)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private String startEncounter(String residentId) throws Exception {
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(verifiedEncounterStart(encounter.get("id").asText())).andExpect(status().isOk());
        return encounter.get("id").asText();
    }

    private void recordNoKnownDrugAllergy(String residentId, String encounterId) throws Exception {
        mockMvc.perform(post("/api/residents/{id}/allergies", residentId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"encounterId":"%s","assertionType":"NO_KNOWN_DRUG_ALLERGY","informationSource":"PATIENT"}
                                """.formatted(encounterId)))
                .andExpect(status().isCreated());
    }
}
