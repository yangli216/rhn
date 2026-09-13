package com.rhn;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("outpatient-main-flow")
class TreatmentExecutionWorkflowTest extends RhnIntegrationTestSupport {
    private static final String TREATMENT_SERVICE_ID = "362387869795105";
    private static final String INJECTABLE_PRODUCT_ID = "362387869795114";
    private static final String INJECTABLE_PACKAGE_ID = "362387869795404";
    private static final String INJECTABLE_STOCK_ITEM_ID = "362387869799608";
    private static final String OUTPATIENT_PHARMACY_DEPARTMENT_ID = "362387869799103";
    private static final String DEMO_PHARMACIST_ID = "362387869799301";
    private static final String DEMO_PHARMACIST_ASSIGNMENT_ID = "362387869799303";

    @Test
    void paid_treatment_service_requires_identity_check_and_completes_execution() throws Exception {
        String suffix = suffix(); String residentId = createResident(suffix); String encounterId = startEncounter(residentId);
        JsonNode request = json(mockMvc.perform(post("/api/encounters/{id}/service-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","quantity":1,"priceType":"SALE","pricingRequired":true,
                                 "reason":"门诊注射治疗","clinicalDescription":"治疗执行闭环测试"}
                                """.formatted(TREATMENT_SERVICE_ID)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.serviceType").value("TREATMENT"))
                .andReturn().getResponse().getContentAsString());

        JsonNode task = taskBySource(request.get("id").asText());
        org.junit.jupiter.api.Assertions.assertEquals("WAITING_SETTLEMENT", task.get("status").asText());
        mockMvc.perform(post("/api/treatments/tasks/{id}/start", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":%d,\"identityVerified\":true}"
                                .formatted(task.get("revision").asLong())))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TREATMENT_START_STATE_INVALID"));

        JsonNode statement = json(mockMvc.perform(get("/api/billing/encounters/{id}/statement", encounterId)
                        .with(rhnWorkContext())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        JsonNode invoice = json(mockMvc.perform(post("/api/billing/accounts/{id}/invoices",
                                statement.get("accountId").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"invoiceNo\":\"TR-INV-%s\",\"settlementScene\":\"OUTPATIENT\"}"
                                .formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/billing/settlements/{id}/payment-orders", invoice.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"idempotencyKey":"TR-PAY-%s","businessScene":"OUTPATIENT",
                                 "paymentSceneCode":"CASHIER","paymentMethodCode":"CASH",
                                 "amount":%s,"terminalCode":"TREATMENT-TEST"}
                                """.formatted(suffix, invoice.get("netAmount").decimalValue().toPlainString())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("SUCCEEDED"));

        task = taskBySource(request.get("id").asText());
        org.junit.jupiter.api.Assertions.assertEquals("READY", task.get("status").asText());
        mockMvc.perform(post("/api/treatments/tasks/{id}/start", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":%d,\"identityVerified\":false}"
                                .formatted(task.get("revision").asLong())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TREATMENT_IDENTITY_VERIFICATION_REQUIRED"));
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
                                 "note":"治疗完成，留观后无不适","adverseReaction":false}
                                """.formatted(started.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.resultCode").value("COMPLETED"));
    }

    @Test
    void self_provided_infusion_lines_are_grouped_as_one_simple_execution_task() throws Exception {
        String suffix = suffix(); String residentId = createResident(suffix); String encounterId = startEncounter(residentId);
        recordNoKnownDrugAllergy(residentId, encounterId);
        JsonNode medication = json(mockMvc.perform(post("/api/platform/master-data/medications").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"TR-IV-%s","name":"治疗执行测试注射液","sdMedicationType":"WESTERN",
                                 "sdDoseForm":"INJECTION","preparationSpec":"10ml","preparationUnit":"支",
                                 "prescriptionDrug":true,"essentialDrug":false,"antimicrobial":false,
                                 "skinTestRequired":false,"defaultDose":1,"defaultDoseUnit":"支",
                                 "defaultRoute":"IVGTT","defaultFrequency":"QD","chronicDiseaseDrug":false,
                                 "singleOrder":false,"sdStatus":"ACTIVE"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode prescription = json(mockMvc.perform(post("/api/encounters/{id}/prescriptions", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"categoryCode\":\"OUTPATIENT\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String line = """
                {"prescriptionId":"%s","medicationId":"%s","quantity":1,"quantityUnit":"支",
                 "doseValue":1,"doseUnit":"支","routeCode":"IVGTT","frequencyCode":"QD",
                 "durationValue":1,"durationUnit":"DAY","substitutionAllowed":true,"selfProvided":true,
                 "pricingRequired":false,"medicationInstruction":"静脉滴注","allergyReviewConfirmed":true%s}
                """;
        JsonNode root = json(mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(line.formatted(prescription.get("id").asText(), medication.get("id").asText(), "")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode child = json(mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(line.formatted(prescription.get("id").asText(), medication.get("id").asText(),
                                ",\"parentRequestId\":\"%s\"".formatted(root.get("id").asText()))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/encounters/{encounterId}/prescriptions/{prescriptionId}/submit",
                                encounterId, prescription.get("id").asText())
                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":0}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"));

        JsonNode values = json(mockMvc.perform(get("/api/treatments/worklist").with(rhnWorkContext())
                        .queryParam("taskType", "MEDICATION"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode task = findTask(values, root.get("id").asText());
        org.junit.jupiter.api.Assertions.assertEquals("READY", task.get("status").asText());
        org.junit.jupiter.api.Assertions.assertEquals(2, task.get("items").size());
        org.junit.jupiter.api.Assertions.assertEquals(child.get("id").asText(),
                task.at("/items/1/sourceId").asText());
    }

    @Test
    void injectable_medication_is_released_only_after_settlement_and_dispense() throws Exception {
        String suffix = suffix(); String residentId = createResident(suffix); String encounterId = startEncounter(residentId);
        recordNoKnownDrugAllergy(residentId, encounterId);
        JsonNode request = json(mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","packageId":"%s","quantity":1,"quantityUnit":"AMP",
                                 "doseValue":100,"doseUnit":"mg","routeCode":"IM","frequencyCode":"ONCE",
                                 "durationValue":1,"durationUnit":"DAY","substitutionAllowed":false,
                                 "selfProvided":false,"priceType":"SALE","pricingRequired":true,
                                 "performerOrganizationId":"%s","performerDepartmentId":"%s",
                                 "reason":"门诊肌内注射","allergyReviewConfirmed":true}
                                """.formatted(INJECTABLE_PRODUCT_ID, INJECTABLE_PACKAGE_ID, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("ACTIVE"))
                .andReturn().getResponse().getContentAsString());

        JsonNode task = taskBySource(request.get("id").asText());
        org.junit.jupiter.api.Assertions.assertEquals("WAITING_SETTLEMENT", task.get("status").asText());
        JsonNode statement = json(mockMvc.perform(get("/api/billing/encounters/{id}/statement", encounterId)
                        .with(rhnWorkContext())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        JsonNode invoice = json(mockMvc.perform(post("/api/billing/accounts/{id}/invoices", statement.get("accountId").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"invoiceNo\":\"TR-MED-INV-%s\",\"settlementScene\":\"OUTPATIENT\"}".formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/billing/settlements/{id}/payment-orders", invoice.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"idempotencyKey":"TR-MED-PAY-%s","businessScene":"OUTPATIENT",
                                 "paymentSceneCode":"CASHIER","paymentMethodCode":"CASH",
                                 "amount":%s,"terminalCode":"TREATMENT-TEST"}
                                """.formatted(suffix, invoice.get("netAmount").decimalValue().toPlainString())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("SUCCEEDED"));

        task = taskBySource(request.get("id").asText());
        org.junit.jupiter.api.Assertions.assertEquals("WAITING_DISPENSE", task.get("status").asText());
        JsonNode dispenseTask = json(mockMvc.perform(post("/api/pharmacy/requests/{id}/intake", request.get("id").asText())
                        .with(pharmacyWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"stockItemId\":\"%s\"}".formatted(INJECTABLE_STOCK_ITEM_ID)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{id}/reviews", dispenseTask.get("id").asText())
                        .with(pharmacyWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"result":"PASS","pharmacistPractitionerId":"%s","reviewerAssignmentId":"%s"}
                                """.formatted(DEMO_PHARMACIST_ID, DEMO_PHARMACIST_ASSIGNMENT_ID)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("READY_TO_PICK"));
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{id}/reservations", dispenseTask.get("id").asText())
                        .with(pharmacyWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{\"expiryMinutes\":30}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.taskStatus").value("PICKING"))
                .andExpect(jsonPath("$.reservedBaseQuantity").value(1));
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{id}/picking/complete", dispenseTask.get("id").asText())
                        .with(pharmacyWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"pickerPractitionerId":"%s","pickerAssignmentId":"%s"}
                                """.formatted(DEMO_PHARMACIST_ID, DEMO_PHARMACIST_ASSIGNMENT_ID)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.taskStatus").value("READY_TO_DISPENSE"));
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{id}/dispenses", dispenseTask.get("id").asText())
                        .with(pharmacyWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"requestCode":"TR-MED-DSP-%s","operationQuantity":1,
                                 "dispenserPractitionerId":"%s","dispenserAssignmentId":"%s"}
                                """.formatted(suffix, DEMO_PHARMACIST_ID, DEMO_PHARMACIST_ASSIGNMENT_ID)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.operationQuantity").value(1));

        task = taskBySource(request.get("id").asText());
        org.junit.jupiter.api.Assertions.assertEquals("READY", task.get("status").asText());
        org.junit.jupiter.api.Assertions.assertTrue(task.at("/items/0/ready").asBoolean());
        JsonNode started = json(mockMvc.perform(post("/api/treatments/tasks/{id}/start", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"identityVerified":true,
                                 "verificationMethod":"NAME_AND_IDENTIFIER","executionSite":"门诊注射室"}
                                """.formatted(task.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/treatments/tasks/{id}/complete", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"resultCode":"COMPLETED",
                                 "note":"注射完成，观察无异常","adverseReaction":false}
                                """.formatted(started.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));
    }

    @Test
    void required_skin_test_blocks_medication_execution_and_positive_result_records_allergy() throws Exception {
        String suffix = suffix(); String residentId = createResident(suffix); String encounterId = startEncounter(residentId);
        recordNoKnownDrugAllergy(residentId, encounterId);
        JsonNode medication = json(mockMvc.perform(post("/api/platform/master-data/medications").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"TR-SKIN-%s","name":"皮试闭环测试注射剂","sdMedicationType":"WESTERN",
                                 "sdDoseForm":"INJECTION","preparationSpec":"80万U","preparationUnit":"支",
                                 "prescriptionDrug":true,"essentialDrug":false,"antimicrobial":true,
                                 "sdAntimicrobialLevel":"NON_RESTRICTED","skinTestRequired":true,
                                 "defaultDose":800000,"defaultDoseUnit":"U","defaultRoute":"IM",
                                 "defaultFrequency":"ONCE","chronicDiseaseDrug":false,"singleOrder":false,
                                 "sdStatus":"ACTIVE"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.skinTestRequired").value(true))
                .andReturn().getResponse().getContentAsString());
        JsonNode prescription = json(mockMvc.perform(post("/api/encounters/{id}/prescriptions", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"categoryCode\":\"OUTPATIENT\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode request = json(mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"prescriptionId":"%s","medicationId":"%s","quantity":1,"quantityUnit":"支",
                                 "doseValue":800000,"doseUnit":"U","routeCode":"IM","frequencyCode":"ONCE",
                                 "durationValue":1,"durationUnit":"DAY","substitutionAllowed":false,
                                 "selfProvided":true,"pricingRequired":false,"medicationInstruction":"肌内注射",
                                 "allergyReviewConfirmed":true}
                                """.formatted(prescription.get("id").asText(), medication.get("id").asText())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/encounters/{encounterId}/prescriptions/{prescriptionId}/submit",
                                encounterId, prescription.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":0}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"));

        JsonNode task = taskBySource(request.get("id").asText());
        org.junit.jupiter.api.Assertions.assertEquals("WAITING_SKIN_TEST", task.get("status").asText());
        JsonNode skinItems = json(mockMvc.perform(get("/api/treatments/skin-tests/worklist")
                        .with(rhnWorkContext()).queryParam("encounterId", encounterId))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode skinItem = findSkinTest(skinItems, request.get("id").asText());
        org.junit.jupiter.api.Assertions.assertEquals("PENDING", skinItem.get("status").asText());
        org.junit.jupiter.api.Assertions.assertEquals("INTRADERMAL", skinItem.get("configuredTestMethod").asText());
        org.junit.jupiter.api.Assertions.assertEquals("DILUTED_SOLUTION", skinItem.get("configuredSolutionMode").asText());
        org.junit.jupiter.api.Assertions.assertEquals(20, skinItem.get("configuredObservationMinutes").asInt());
        org.junit.jupiter.api.Assertions.assertFalse(skinItem.get("settlementRequiredBeforeStart").asBoolean());
        org.junit.jupiter.api.Assertions.assertFalse(skinItem.get("dispenseRequiredBeforeStart").asBoolean());
        mockMvc.perform(post("/api/treatments/skin-tests/medication-requests/{id}/start", request.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedMedicationRevision":%d,"identityVerified":false,
                                 "verificationMethod":"NAME_AND_IDENTIFIER","testMethod":"INTRADERMAL",
                                 "originalSolution":false,"bodySite":"左前臂屈侧","observationMinutes":20}
                                """.formatted(skinItem.get("medicationRequestRevision").asLong())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SKIN_TEST_IDENTITY_VERIFICATION_REQUIRED"));
        JsonNode started = json(mockMvc.perform(post(
                                "/api/treatments/skin-tests/medication-requests/{id}/start", request.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedMedicationRevision":%d,"identityVerified":true,
                                 "verificationMethod":"NAME_AND_IDENTIFIER","testMethod":"INTRADERMAL",
                                 "originalSolution":false,"solutionName":"标准配制皮试液","lotNo":"SK-%s",
                                 "concentration":500,"concentrationUnit":"U/ml","bodySite":"左前臂屈侧",
                                 "observationMinutes":20}
                                """.formatted(skinItem.get("medicationRequestRevision").asLong(), suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("IN_PROGRESS"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/treatments/skin-tests/events/{id}/complete", started.get("eventId").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"result":"POSITIVE","whealDiameterMm":8,
                                 "flareDiameterMm":16,"reactionDescription":"局部风团伴明显红晕",
                                 "earlyReadReason":"已出现明确阳性局部反应，立即停止观察并判读"}
                                """.formatted(started.get("eventRevision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("POSITIVE"))
                .andExpect(jsonPath("$.result").value("POSITIVE"));

        task = taskBySource(request.get("id").asText());
        org.junit.jupiter.api.Assertions.assertEquals("EXCEPTION", task.get("status").asText());
        org.junit.jupiter.api.Assertions.assertEquals("POSITIVE", task.at("/items/0/skinTestResult").asText());
        mockMvc.perform(get("/api/residents/{id}/allergies", residentId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].assertionType").value("ALLERGY"))
                .andExpect(jsonPath("$[0].categoryCode").value("DRUG"))
                .andExpect(jsonPath("$[0].substanceCode").value("TR-SKIN-" + suffix));
    }

    private JsonNode taskBySource(String sourceId) throws Exception {
        JsonNode values = json(mockMvc.perform(get("/api/treatments/worklist").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        return findTask(values, sourceId);
    }

    private JsonNode findTask(JsonNode values, String sourceId) {
        for (JsonNode value : values) for (JsonNode item : value.get("items")) {
            if (sourceId.equals(item.get("sourceId").asText())) return value;
        }
        throw new AssertionError("未找到治疗任务：" + sourceId);
    }

    private JsonNode findSkinTest(JsonNode values, String requestId) {
        for (JsonNode value : values) {
            if (requestId.equals(value.get("medicationRequestId").asText())) return value;
        }
        throw new AssertionError("未找到皮试任务：" + requestId);
    }

    private String suffix() { return UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase(); }

    private String createResident(String suffix) throws Exception {
        String digits = "%04d".formatted(Math.floorMod(suffix.hashCode(), 10000));
        return json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"治疗闭环测试居民","identifiers":[{"system":"9","value":"33010219920808%s","useType":"SECONDARY"}],
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
                                {"encounterId":"%s","assertionType":"NO_KNOWN_DRUG_ALLERGY",
                                 "informationSource":"PATIENT"}
                                """.formatted(encounterId)))
                .andExpect(status().isCreated());
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
