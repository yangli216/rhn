package com.rhn;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@TestPropertySource(properties = {
        "rhn.pharmacy.require-settlement-authorization=true",
        "rhn.diagnostics.require-settlement-authorization=true"
})
@Tag("outpatient-main-flow")
class OutpatientFlowCoordinationTest extends RhnIntegrationTestSupport {
    private static final String TREATMENT_SERVICE_ID = "362387869795105";
    private static final String LABORATORY_SERVICE_ID = "362387869795101";
    private static final String IMAGING_SERVICE_ID = "362387869795103";
    private static final String MEDICATION_PRODUCT_ID = "362387869795113";
    private static final String MEDICATION_PACKAGE_ID = "362387869795403";
    private static final String OUTPATIENT_PHARMACY_DEPARTMENT_ID = "362387869799103";
    private static final String OUTPATIENT_PHARMACY_SITE_ID = "362387869799502";
    private static final String DEMO_PHARMACIST_ID = "362387869799301";
    private static final String DEMO_PHARMACIST_ASSIGNMENT_ID = "362387869799303";

    @Test
    void clinical_completion_keeps_patient_in_flow_until_paid_treatment_is_completed() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String residentId = createResident(suffix);
        String encounterId = createAndStartEncounter(residentId);
        saveClinicalRecord(encounterId);
        JsonNode request = json(mockMvc.perform(post("/api/encounters/{id}/service-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","quantity":1,"priceType":"SALE","pricingRequired":true,
                                 "reason":"门诊注射治疗","clinicalDescription":"门诊流转测试"}
                                """.formatted(TREATMENT_SERVICE_ID)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        signClinicalDocument(encounterId);
        mockMvc.perform(post("/api/encounters/{id}/complete", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"dispositionCode\":\"HOME\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));

        JsonNode visit = flowVisit(encounterId);
        assertEquals("COMPLETED", visit.get("clinicalStatus").asText());
        assertEquals("WAITING_SETTLEMENT", visit.get("flowStatus").asText());
        assertEquals("费用结算", visit.get("nextDestination").asText());
        assertEquals("去结算", visit.get("nextActionText").asText());
        assertEquals(true, visit.get("attentionReason").asText().startsWith("存在待收费用"));
        assertEquals(true, visit.get("pendingMinutes").asLong() >= 0);

        JsonNode statement = json(mockMvc.perform(get("/api/billing/encounters/{id}/statement", encounterId)
                        .with(rhnWorkContext())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        JsonNode invoice = json(mockMvc.perform(post("/api/billing/accounts/{id}/invoices",
                                statement.get("accountId").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"invoiceNo\":\"FLOW-INV-%s\",\"settlementScene\":\"OUTPATIENT\"}"
                                .formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/billing/settlements/{id}/payment-orders", invoice.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"idempotencyKey":"FLOW-PAY-%s","businessScene":"OUTPATIENT",
                                 "paymentSceneCode":"CASHIER","paymentMethodCode":"CASH",
                                 "amount":%s,"terminalCode":"FLOW-TEST"}
                                """.formatted(suffix, invoice.get("netAmount").decimalValue().toPlainString())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("SUCCEEDED"));

        visit = flowVisit(encounterId);
        assertEquals("WAITING_TREATMENT", visit.get("flowStatus").asText());
        assertEquals("治疗执行", visit.get("nextDestination").asText());
        assertEquals("去治疗", visit.get("nextActionText").asText());

        JsonNode task = treatmentTask(request.get("id").asText());
        JsonNode started = json(mockMvc.perform(post("/api/treatments/tasks/{id}/start", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"identityVerified":true,
                                 "verificationMethod":"NAME_AND_IDENTIFIER","executionSite":"门诊治疗室"}
                                """.formatted(task.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/treatments/tasks/{id}/complete", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"resultCode":"COMPLETED",
                                 "note":"治疗完成","adverseReaction":false}
                                """.formatted(started.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));

        visit = flowVisit(encounterId);
        assertEquals("COMPLETED", visit.get("flowStatus").asText());
        assertEquals("可以离院", visit.get("nextDestination").asText());
        assertEquals("接诊及诊后环节均已完成", visit.get("attentionReason").asText());
        assertEquals(0, visit.get("pendingMinutes").asLong());
    }

    @Test
    void one_visit_coordinates_settlement_pharmacy_diagnostics_and_treatment_until_departure() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String residentId = createResident(suffix);
        String encounterId = createAndStartEncounter(residentId);
        recordNoKnownDrugAllergy(residentId, encounterId);
        saveClinicalRecord(encounterId);

        JsonNode laboratory = createServiceRequest(encounterId, LABORATORY_SERVICE_ID,
                "感染指标评估", "咳嗽伴低热三天");
        JsonNode imaging = createServiceRequest(encounterId, IMAGING_SERVICE_ID,
                "腹部不适评估", "乏力伴食欲下降");
        JsonNode treatment = createServiceRequest(encounterId, TREATMENT_SERVICE_ID,
                "门诊对症治疗", "复合门诊主流程验收");
        JsonNode medication = json(mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","packageId":"%s","quantity":1,"quantityUnit":"BOX",
                                 "doseValue":5,"doseUnit":"mg","routeCode":"ORAL","frequencyCode":"QD",
                                 "durationValue":14,"durationUnit":"DAY","substitutionAllowed":false,
                                 "selfProvided":false,"priceType":"SALE","pricingRequired":true,
                                 "reason":"高血压门诊续方"}
                                """.formatted(MEDICATION_PRODUCT_ID, MEDICATION_PACKAGE_ID)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("ACTIVE"))
                .andReturn().getResponse().getContentAsString());

        signClinicalDocument(encounterId);
        mockMvc.perform(post("/api/encounters/{id}/complete", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"dispositionCode\":\"HOME\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));

        JsonNode visit = flowVisit(encounterId);
        assertEquals("WAITING_SETTLEMENT", visit.get("flowStatus").asText());
        assertEquals("费用结算", visit.get("nextDestination").asText());
        assertStage(visit, "PHARMACY", "WAITING", 1, 1);
        assertStage(visit, "DIAGNOSTICS", "BLOCKED", 2, 2);
        assertStage(visit, "TREATMENT", "BLOCKED", 1, 1);

        JsonNode statement = json(mockMvc.perform(get("/api/billing/encounters/{id}/statement", encounterId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.charges.length()").value(4))
                .andExpect(jsonPath("$.uninvoicedAmount").value(107.6))
                .andReturn().getResponse().getContentAsString());
        JsonNode invoice = json(mockMvc.perform(post("/api/billing/accounts/{id}/invoices",
                                statement.get("accountId").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"invoiceNo\":\"CMP-INV-%s\",\"settlementScene\":\"OUTPATIENT\"}"
                                .formatted(suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.netAmount").value(107.6))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/billing/settlements/{id}/payment-orders", invoice.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"idempotencyKey":"CMP-PAY-%s","businessScene":"OUTPATIENT",
                                 "paymentSceneCode":"CASHIER","paymentMethodCode":"CASH",
                                 "amount":107.60,"terminalCode":"COMPOSITE-TEST"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("SUCCEEDED"));

        visit = flowVisit(encounterId);
        assertEquals("WAITING_PHARMACY", visit.get("flowStatus").asText());
        assertEquals("门诊药房", visit.get("nextDestination").asText());
        assertStage(visit, "BILLING", "COMPLETED", 1, 0);
        assertStage(visit, "DIAGNOSTICS", "WAITING", 2, 2);
        assertStage(visit, "TREATMENT", "WAITING", 1, 1);

        dispense(medication.get("id").asText(), suffix);
        visit = flowVisit(encounterId);
        assertEquals("WAITING_DIAGNOSTICS", visit.get("flowStatus").asText());
        assertEquals("检查检验", visit.get("nextDestination").asText());
        assertStage(visit, "PHARMACY", "COMPLETED", 1, 0);

        completeLaboratory(laboratory.get("id").asText(), suffix);
        completeImaging(imaging.get("id").asText());
        visit = flowVisit(encounterId);
        assertEquals("WAITING_TREATMENT", visit.get("flowStatus").asText());
        assertEquals("治疗执行", visit.get("nextDestination").asText());
        assertStage(visit, "DIAGNOSTICS", "COMPLETED", 2, 0);

        completeTreatment(treatment.get("id").asText());
        visit = flowVisit(encounterId);
        assertEquals("COMPLETED", visit.get("flowStatus").asText());
        assertEquals("可以离院", visit.get("nextDestination").asText());
        assertEquals("接诊及诊后环节均已完成", visit.get("attentionReason").asText());
        assertEquals(0, visit.get("pendingMinutes").asLong());
        assertStage(visit, "CLINICAL", "COMPLETED", 1, 0);
        assertStage(visit, "BILLING", "COMPLETED", 1, 0);
        assertStage(visit, "PHARMACY", "COMPLETED", 1, 0);
        assertStage(visit, "DIAGNOSTICS", "COMPLETED", 2, 0);
        assertStage(visit, "TREATMENT", "COMPLETED", 1, 0);

        mockMvc.perform(get("/api/billing/encounters/{id}/statement", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.accountBalance").value(0))
                .andExpect(jsonPath("$.uninvoicedAmount").value(0));
    }

    private JsonNode createServiceRequest(String encounterId, String catalogItemId,
                                          String reason, String clinicalDescription) throws Exception {
        return json(mockMvc.perform(post("/api/encounters/{id}/service-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","quantity":1,"priceType":"SALE","pricingRequired":true,
                                 "reason":"%s","clinicalDescription":"%s"}
                                """.formatted(catalogItemId, reason, clinicalDescription)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("ACTIVE"))
                .andReturn().getResponse().getContentAsString());
    }

    private void dispense(String medicationRequestId, String suffix) throws Exception {
        JsonNode items = json(mockMvc.perform(get("/api/pharmacy/stock-sites/{id}/stock-items",
                                OUTPATIENT_PHARMACY_SITE_ID).with(pharmacyWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        String stockItemId = findBy(items, "catalogItemId", MEDICATION_PRODUCT_ID).get("id").asText();
        JsonNode task = json(mockMvc.perform(post("/api/pharmacy/requests/{id}/intake", medicationRequestId)
                        .with(pharmacyWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"stockItemId\":\"%s\"}".formatted(stockItemId)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PENDING_REVIEW"))
                .andReturn().getResponse().getContentAsString());
        String taskId = task.get("id").asText();
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{id}/reviews", taskId)
                        .with(pharmacyWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"result":"PASS","pharmacistPractitionerId":"%s",
                                 "reviewerAssignmentId":"%s"}
                                """.formatted(DEMO_PHARMACIST_ID, DEMO_PHARMACIST_ASSIGNMENT_ID)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("READY_TO_PICK"));
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{id}/reservations", taskId)
                        .with(pharmacyWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expiryMinutes\":30}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.taskStatus").value("PICKING"))
                .andExpect(jsonPath("$.reservedBaseQuantity").value(14));
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{id}/picking/complete", taskId)
                        .with(pharmacyWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"pickerPractitionerId":"%s","pickerAssignmentId":"%s"}
                                """.formatted(DEMO_PHARMACIST_ID, DEMO_PHARMACIST_ASSIGNMENT_ID)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.taskStatus").value("READY_TO_DISPENSE"));
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{id}/dispenses", taskId)
                        .with(pharmacyWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"requestCode":"CMP-DSP-%s","operationQuantity":1,
                                 "dispenserPractitionerId":"%s","dispenserAssignmentId":"%s"}
                                """.formatted(suffix, DEMO_PHARMACIST_ID, DEMO_PHARMACIST_ASSIGNMENT_ID)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.operationQuantity").value(1));
        mockMvc.perform(get("/api/pharmacy/dispense-tasks/{id}/trace", taskId).with(pharmacyWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.taskStatus").value("COMPLETED"));
    }

    private void completeLaboratory(String requestId, String suffix) throws Exception {
        JsonNode task = diagnosticTask(requestId);
        JsonNode collected = json(mockMvc.perform(post("/api/diagnostics/tasks/{id}/collection",
                                task.get("id").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":%d,\"specimenNo\":\"CMP-SP-%s\"}"
                                .formatted(task.get("revision").asLong(), suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COLLECTED"))
                .andReturn().getResponse().getContentAsString());
        JsonNode started = json(mockMvc.perform(post("/api/diagnostics/tasks/{id}/start",
                                task.get("id").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":%d}".formatted(collected.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/diagnostics/tasks/{id}/local-reports", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"valueType":"NUMBER","observationValue":"6.2",
                                 "unitCode":"10^9/L","referenceRangeLow":3.5,"referenceRangeHigh":9.5,
                                 "interpretationCode":"N","conclusion":"白细胞计数在参考范围内"}
                                """.formatted(started.get("revision").asLong())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("FINAL"));
    }

    private void completeImaging(String requestId) throws Exception {
        JsonNode task = diagnosticTask(requestId);
        JsonNode started = json(mockMvc.perform(post("/api/diagnostics/tasks/{id}/start",
                                task.get("id").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":%d}".formatted(task.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/diagnostics/tasks/{id}/local-reports", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":%d,\"conclusion\":\"肝胆胰脾未见明显异常\"}"
                                .formatted(started.get("revision").asLong())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.reportType").value("IMAGING"))
                .andExpect(jsonPath("$.status").value("FINAL"));
    }

    private JsonNode diagnosticTask(String requestId) throws Exception {
        JsonNode values = json(mockMvc.perform(get("/api/diagnostics/worklist").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        return findBy(values, "requestId", requestId);
    }

    private void completeTreatment(String requestId) throws Exception {
        JsonNode values = json(mockMvc.perform(get("/api/treatments/worklist").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode task = null;
        for (JsonNode value : values) for (JsonNode item : value.get("items")) {
            if (requestId.equals(item.get("sourceId").asText())) task = value;
        }
        if (task == null) throw new AssertionError("未找到治疗任务：" + requestId);
        JsonNode started = json(mockMvc.perform(post("/api/treatments/tasks/{id}/start", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"identityVerified":true,
                                 "verificationMethod":"NAME_AND_IDENTIFIER","executionSite":"门诊治疗室"}
                                """.formatted(task.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/treatments/tasks/{id}/complete", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"resultCode":"COMPLETED",
                                 "note":"门诊治疗完成，观察无异常","adverseReaction":false}
                                """.formatted(started.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));
    }

    private void assertStage(JsonNode visit, String stageCode, String expectedStatus,
                             int totalCount, int pendingCount) {
        JsonNode stage = findBy(visit.get("stages"), "stageCode", stageCode);
        assertEquals(expectedStatus, stage.get("status").asText());
        assertEquals(totalCount, stage.get("totalCount").asInt());
        assertEquals(pendingCount, stage.get("pendingCount").asInt());
    }

    private JsonNode findBy(JsonNode values, String field, String expected) {
        for (JsonNode value : values) if (expected.equals(value.get(field).asText())) return value;
        throw new AssertionError("未找到 " + field + "=" + expected);
    }

    private JsonNode flowVisit(String encounterId) throws Exception {
        JsonNode board = json(mockMvc.perform(get("/api/outpatient-flow").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        for (JsonNode visit : board.get("visits")) {
            if (encounterId.equals(visit.get("encounterId").asText())) return visit;
        }
        throw new AssertionError("流转看板未找到就诊：" + encounterId);
    }

    private JsonNode treatmentTask(String sourceId) throws Exception {
        JsonNode values = json(mockMvc.perform(get("/api/treatments/worklist").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        for (JsonNode value : values) for (JsonNode item : value.get("items")) {
            if (sourceId.equals(item.get("sourceId").asText())) return value;
        }
        throw new AssertionError("未找到治疗任务：" + sourceId);
    }

    private String createResident(String suffix) throws Exception {
        String digits = "%04d".formatted(Math.floorMod(suffix.hashCode(), 10000));
        return json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"门诊流转测试居民","nationalId":"33010219930808%s",
                                 "gender":"FEMALE","birthDate":"1993-08-08"}
                                """.formatted(digits)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private String createAndStartEncounter(String residentId) throws Exception {
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(verifiedEncounterStart(encounter.get("id").asText())).andExpect(status().isOk());
        return encounter.get("id").asText();
    }

    private void saveClinicalRecord(String encounterId) throws Exception {
        mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"chiefComplaint":"咳嗽三天","presentIllness":"无呼吸困难",
                                 "medicalHistory":"无特殊","physicalExam":"双肺呼吸音清",
                                 "treatmentPlan":"门诊对症治疗","systolic":122,"diastolic":78,
                                 "diagnoses":[{"code":"R05","display":"咳嗽","type":"PRIMARY"}]}
                                """))
                .andExpect(status().isOk());
    }

    private void recordNoKnownDrugAllergy(String residentId, String encounterId) throws Exception {
        mockMvc.perform(post("/api/residents/{id}/allergies", residentId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"encounterId":"%s","assertionType":"NO_KNOWN_DRUG_ALLERGY",
                                 "informationSource":"PATIENT"}
                                """.formatted(encounterId)))
                .andExpect(status().isCreated());
    }

    private void signClinicalDocument(String encounterId) throws Exception {
        JsonNode documents = json(mockMvc.perform(get("/api/clinical-documents").with(rhnWorkContext())
                        .queryParam("encounterId", encounterId))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/clinical-documents/{id}/sign", documents.get(0).get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedCurrentVersion\":1,\"signatureMeaning\":\"AUTHOR\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SIGNED"));
    }

    private RequestPostProcessor pharmacyWorkContext() {
        return request -> {
            rhn().postProcessRequest(request);
            ((MockHttpServletRequest) request).addHeader("X-Organization-Id", ORGANIZATION);
            ((MockHttpServletRequest) request).addHeader("X-Department-Id", OUTPATIENT_PHARMACY_DEPARTMENT_ID);
            return request;
        };
    }
}
