package com.rhn;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@TestPropertySource(properties = "rhn.pharmacy.require-settlement-authorization=true")
@Tag("outpatient-main-flow")
class OutpatientMainFlowTest extends RhnIntegrationTestSupport {
    private static final String OUTPATIENT_SERVICE_ID = "362387869795104";
    private static final String PRODUCT_ID = "362387869795113";
    private static final String PACKAGE_ID = "362387869795403";

    @Test
    void diagnosis_order_is_persisted_and_the_first_item_is_the_unique_primary_diagnosis() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        String residentId = createResident(suffix);
        String encounterId = createAndStartEncounter(residentId);

        mockMvc.perform(put("/api/encounters/{encounterId}/clinical-record", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "chiefComplaint":"血压升高伴头晕","systolic":158,"diastolic":96,"diagnoses":[
                                    {"code":"I10","display":"原发性高血压","type":"PRIMARY"},
                                    {"code":"R42","display":"头晕","type":"SECONDARY"}
                                  ]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.diagnoses[0].code").value("I10"))
                .andExpect(jsonPath("$.diagnoses[0].sortOrder").value(1))
                .andExpect(jsonPath("$.diagnoses[1].sortOrder").value(2));

        mockMvc.perform(put("/api/encounters/{encounterId}/clinical-record", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "chiefComplaint":"血压升高伴头晕","systolic":158,"diastolic":96,"diagnoses":[
                                    {"code":"R42","display":"头晕","type":"PRIMARY"},
                                    {"code":"I10","display":"原发性高血压","type":"SECONDARY"}
                                  ]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.diagnoses[0].code").value("R42"))
                .andExpect(jsonPath("$.diagnoses[0].type").value("PRIMARY"))
                .andExpect(jsonPath("$.diagnoses[0].sortOrder").value(1))
                .andExpect(jsonPath("$.diagnoses[1].code").value("I10"))
                .andExpect(jsonPath("$.diagnoses[1].type").value("SECONDARY"))
                .andExpect(jsonPath("$.diagnoses[1].sortOrder").value(2));

        mockMvc.perform(put("/api/encounters/{encounterId}/clinical-record", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "chiefComplaint":"血压升高伴头晕","systolic":158,"diastolic":96,"diagnoses":[
                                    {"code":"I10","display":"原发性高血压","type":"SECONDARY"},
                                    {"code":"R42","display":"头晕","type":"PRIMARY"}
                                  ]
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PRIMARY_DIAGNOSIS_ORDER_INVALID"));
    }

    @Test
    void outpatient_visit_charges_orders_before_execution_and_releases_pharmacy_only_after_settlement()
            throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        String residentId = createResident(suffix);
        String encounterId = createAndStartEncounter(residentId);
        recordNoKnownDrugAllergy(residentId, encounterId);
        saveClinicalRecord(encounterId);

        mockMvc.perform(post("/api/encounters/{encounterId}/service-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "catalogItemId":"%s","quantity":1,"unitCode":"次",
                                  "priceType":"SALE","pricingRequired":true,
                                  "performerOrganizationId":"%s","performerDepartmentId":"%s",
                                  "reason":"基层全科门诊诊查"
                                }
                                """.formatted(OUTPATIENT_SERVICE_ID, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.totalAmount").value(10.0));

        JsonNode medicationRequest = json(mockMvc.perform(post(
                                "/api/encounters/{encounterId}/medication-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "catalogItemId":"%s","packageId":"%s","quantity":1,
                                  "quantityUnit":"BOX","substitutionAllowed":false,"selfProvided":false,
                                  "priceType":"SALE","pricingRequired":true,
                                  "performerOrganizationId":"%s","performerDepartmentId":"%s",
                                  "reason":"高血压门诊治疗"
                                }
                                """.formatted(PRODUCT_ID, PACKAGE_ID, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.packageSpec").value("5mg*14片/盒"))
                .andExpect(jsonPath("$.manufacturerName").value("示范制药有限公司"))
                .andExpect(jsonPath("$.totalAmount").value(18.6))
                .andReturn().getResponse().getContentAsString());

        JsonNode statement = json(mockMvc.perform(get(
                                "/api/billing/encounters/{encounterId}/statement", encounterId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.charges.length()").value(2))
                .andExpect(jsonPath("$.chargeAmount").value(28.6))
                .andExpect(jsonPath("$.uninvoicedAmount").value(28.6))
                .andExpect(jsonPath("$.charges[?(@.sourceType == 'SERVICE_REQUEST')]").exists())
                .andExpect(jsonPath("$.charges[?(@.sourceType == 'MEDICATION_REQUEST')]").exists())
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(get("/api/billing/worklist").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].status".formatted(encounterId))
                        .value("PENDING_INVOICE"))
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].sourceEventCount".formatted(encounterId))
                        .value(2))
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].chargedEventCount".formatted(encounterId))
                        .value(2))
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].residentName".formatted(encounterId))
                        .value("门诊主流程患者"))
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].healthRecordNo".formatted(encounterId))
                        .isNotEmpty())
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].encounterNo".formatted(encounterId))
                        .isNotEmpty());

        PharmacyFixture pharmacy = createPharmacy(suffix);
        mockMvc.perform(get("/api/pharmacy/inbox").with(rhnWorkContext())
                        .queryParam("organizationId", ORGANIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.request.id == '%s')]"
                        .formatted(medicationRequest.get("id").asText())).isEmpty());
        mockMvc.perform(post("/api/pharmacy/requests/{requestId}/intake",
                        medicationRequest.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"stockItemId\":\"%s\"}".formatted(pharmacy.stockItemId())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MEDICATION_REQUEST_SETTLEMENT_REQUIRED"));

        JsonNode invoice = json(mockMvc.perform(post("/api/billing/accounts/{accountId}/invoices",
                                statement.get("accountId").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "invoiceNo":"OPD-INV-%s","settlementScene":"OUTPATIENT",
                                  "terminalScene":"DOCTOR_STATION","terminalCode":"OPD-TEST"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.lines.length()").value(2))
                .andExpect(jsonPath("$.netAmount").value(28.6))
                .andReturn().getResponse().getContentAsString());

        JsonNode paymentOrder = json(mockMvc.perform(post(
                                "/api/billing/settlements/{settlementId}/payment-orders", invoice.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "idempotencyKey":"OPD-PAY-%s","businessScene":"OUTPATIENT",
                                  "paymentSceneCode":"CASHIER","paymentMethodCode":"CASH",
                                  "amount":28.60,"terminalCode":"OPD-TEST"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("SUCCEEDED"))
                .andReturn().getResponse().getContentAsString());
        assertEquals(0, new BigDecimal("28.60").compareTo(paymentOrder.get("capturedAmount").decimalValue()));

        mockMvc.perform(get("/api/pharmacy/inbox").with(rhnWorkContext())
                        .queryParam("organizationId", ORGANIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.request.id == '%s')].request.status"
                        .formatted(medicationRequest.get("id").asText())).value("ACTIVE"));
        JsonNode task = json(mockMvc.perform(post("/api/pharmacy/requests/{requestId}/intake",
                                medicationRequest.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"stockItemId\":\"%s\",\"description\":\"结算后窗口接方\"}"
                                .formatted(pharmacy.stockItemId())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING_REVIEW"))
                .andReturn().getResponse().getContentAsString());

        Reviewer pharmacist = createReviewer(suffix);
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/reviews", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "result":"PASS","pharmacistPractitionerId":"%s",
                                  "reviewerAssignmentId":"%s"
                                }
                                """.formatted(pharmacist.practitionerId(), pharmacist.assignmentId())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("READY_TO_PICK"));
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/reservations", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expiryMinutes\":30}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.taskStatus").value("PICKING"))
                .andExpect(jsonPath("$.reservedBaseQuantity").value(14));
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/picking/complete", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "pickerPractitionerId":"%s","pickerAssignmentId":"%s",
                                  "description":"门诊主流程配药核对完成"
                                }
                                """.formatted(pharmacist.practitionerId(), pharmacist.assignmentId())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.taskStatus").value("READY_TO_DISPENSE"));
        JsonNode dispense = json(mockMvc.perform(post(
                                "/api/pharmacy/dispense-tasks/{taskId}/dispenses", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "requestCode":"OPD-DSP-%s","operationQuantity":1,
                                  "dispenserPractitionerId":"%s","dispenserAssignmentId":"%s",
                                  "description":"门诊窗口实际发药"
                                }
                                """.formatted(suffix, pharmacist.practitionerId(), pharmacist.assignmentId())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.dispenseType").value("DISPENSE"))
                .andExpect(jsonPath("$.operationQuantity").value(1))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(get("/api/pharmacy/dispense-tasks/{taskId}/trace", task.get("id").asText())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.taskStatus").value("COMPLETED"))
                .andExpect(jsonPath("$.netDispensedQuantity").value(1));

        signClinicalDocument(encounterId);
        mockMvc.perform(post("/api/encounters/{encounterId}/complete", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dispositionCode\":\"HOME\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        mockMvc.perform(post("/api/pharmacy/dispenses/{dispenseId}/returns", dispense.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "returnNo":"OPD-RET-%s","reasonCode":"PATIENT_NOT_USE",
                                  "processorPractitionerId":"%s","processorAssignmentId":"%s",
                                  "description":"患者未使用，完整包装退回",
                                  "lines":[{"originalDispenseLineId":"%s","quantity":1,"disposition":"RESTOCK"}]
                                }
                                """.formatted(suffix, pharmacist.practitionerId(), pharmacist.assignmentId(),
                                dispense.at("/lines/0/id").asText())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("CONFIRMED"));

        JsonNode afterReturn = json(mockMvc.perform(get(
                                "/api/billing/encounters/{encounterId}/statement", encounterId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.charges.length()").value(3))
                .andExpect(jsonPath("$.charges[?(@.sourceType == 'MEDICATION_RETURN')]").exists())
                .andExpect(jsonPath("$.uninvoicedAmount").value(-18.6))
                .andExpect(jsonPath("$.accountBalance").value(-18.6))
                .andReturn().getResponse().getContentAsString());
        JsonNode creditInvoice = json(mockMvc.perform(post("/api/billing/accounts/{accountId}/invoices",
                                statement.get("accountId").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"invoiceNo\":\"OPD-CRN-%s\"}".formatted(suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.invoiceType").value("CREDIT"))
                .andExpect(jsonPath("$.netAmount").value(-18.6))
                .andReturn().getResponse().getContentAsString());
        assertEquals("CREDIT", creditInvoice.get("invoiceType").asText());
        mockMvc.perform(post("/api/billing/payments/{paymentId}/refund-orders",
                                afterReturn.at("/payments/0/id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "idempotencyKey":"OPD-RF-%s","amount":18.60,
                                  "reason":"门诊退药原路退款","terminalCode":"OPD-TEST"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.orderType").value("REFUND"))
                .andExpect(jsonPath("$.status").value("REFUNDED"));
        mockMvc.perform(get("/api/billing/encounters/{encounterId}/statement", encounterId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.refundAmount").value(18.6))
                .andExpect(jsonPath("$.accountBalance").value(0));
    }

    private String createResident(String suffix) throws Exception {
        String digits = "%04d".formatted(Math.floorMod(suffix.hashCode(), 10000));
        return json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"门诊主流程患者","identifiers":[{"system":"9","value":"33010219880808%s","useType":"SECONDARY"}],
                                  "gender":"FEMALE","birthDate":"1988-08-08","phone":"13800138000"
                                }
                                """.formatted(digits)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private String createAndStartEncounter(String residentId) throws Exception {
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(verifiedEncounterStart(encounter.get("id").asText()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"));
        return encounter.get("id").asText();
    }

    private void recordNoKnownDrugAllergy(String residentId, String encounterId) throws Exception {
        mockMvc.perform(post("/api/residents/{residentId}/allergies", residentId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "encounterId":"%s","assertionType":"NO_KNOWN_DRUG_ALLERGY",
                                  "informationSource":"PATIENT"
                                }
                                """.formatted(encounterId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.assertionType").value("NO_KNOWN_DRUG_ALLERGY"));
    }

    private void saveClinicalRecord(String encounterId) throws Exception {
        mockMvc.perform(put("/api/encounters/{encounterId}/clinical-record", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "chiefComplaint":"血压升高伴头晕三天","presentIllness":"无胸痛及意识障碍",
                                  "medicalHistory":"既往高血压","physicalExam":"心肺查体未见明显异常",
                                  "treatmentPlan":"口服降压药并监测血压","systolic":158,"diastolic":96,
                                  "temperature":36.5,"pulseRate":82,
                                  "diagnoses":[{"code":"I10","display":"原发性高血压","type":"PRIMARY"}]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.diagnoses[0].code").value("I10"));
    }

    private PharmacyFixture createPharmacy(String suffix) throws Exception {
        JsonNode site = json(mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","departmentId":"%s",
                                  "code":"OPD-%s","name":"门诊流程药房%s",
                                  "siteType":"PHARMACY","serviceScope":"OUTPATIENT","validFrom":"2026-01-01"
                                }
                                """.formatted(ORGANIZATION, DEPARTMENT, suffix, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode item = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{siteId}/stock-items", site.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "catalogItemId":"%s","packageId":"%s","issuePolicy":"FEFO",
                                  "negativeAllowed":false,"lotRequired":true,"traceRequired":false,
                                  "splitAllowed":false,"coldChain":false,"controlled":false,"highAlert":false
                                }
                                """.formatted(PRODUCT_ID, PACKAGE_ID)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode bin = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{siteId}/stock-bins", site.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "code":"OPD-PICK","name":"门诊发药位","binType":"COUNTER",
                                  "stockDefault":"AVAILABLE","receiveAllowed":true,"pickAllowed":true,
                                  "countAllowed":true,"sortOrder":10
                                }
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode lot = json(mockMvc.perform(post("/api/pharmacy/stock-items/{stockItemId}/lots",
                                item.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "lotNo":"OPD-%s","productionDate":"2026-01-01","expiryDate":"2027-12-31",
                                  "manufacturerNameSnapshot":"示例制药企业","qualityStatus":"QUALIFIED"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/pharmacy/inventory/receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "requestCode":"OPD-RCV-%s","sourceCode":"OPENING-%s",
                                  "stockItemId":"%s","stockBinId":"%s","stockLotId":"%s",
                                  "operationQuantity":10,"unitCost":0.60,"occurredAt":"%s",
                                  "description":"门诊主流程期初库存"
                                }
                                """.formatted(suffix, suffix, item.get("id").asText(), bin.get("id").asText(),
                                lot.get("id").asText(), Instant.now())))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/pharmacy/dispense-routes").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","code":"OPD-ROUTE-%s","name":"门诊发药路由%s",
                                  "careSetting":"OUTPATIENT","sourceDepartmentId":"%s",
                                  "targetStockSiteId":"%s","active":true,"validFrom":"2026-01-01"
                                }
                                """.formatted(ORGANIZATION, suffix, suffix, DEPARTMENT, site.get("id").asText())))
                .andExpect(status().isCreated());
        return new PharmacyFixture(item.get("id").asText());
    }

    private Reviewer createReviewer(String suffix) throws Exception {
        JsonNode practitioner = json(mockMvc.perform(post("/api/platform/practitioners").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"OPD-PHARM-%s","fullName":"门诊主流程药师","sdPractGender":"FEMALE"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode position = json(mockMvc.perform(post("/api/platform/positions").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"OPD-POS-%s","name":"门诊药师","sdPositionType":"PHARMACY"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode employment = json(mockMvc.perform(post("/api/platform/employments").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "practitionerId":"%s","organizationId":"%s","code":"OPD-EMP-%s",
                                  "sdEmploymentType":"PERMANENT","primaryEmployment":true,
                                  "hireDate":"2026-01-01"
                                }
                                """.formatted(practitioner.get("id").asText(), ORGANIZATION, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode assignment = json(mockMvc.perform(post("/api/platform/assignments").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "employmentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "positionId":"%s","code":"OPD-ASN-%s","sdAssignmentType":"PRIMARY",
                                  "primaryAssignment":true,"validFrom":"2026-01-01"
                                }
                                """.formatted(employment.get("id").asText(), ORGANIZATION, DEPARTMENT,
                                position.get("id").asText(), suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return new Reviewer(practitioner.get("id").asText(), assignment.get("id").asText());
    }

    private void signClinicalDocument(String encounterId) throws Exception {
        JsonNode documents = json(mockMvc.perform(get("/api/clinical-documents")
                        .with(rhnWorkContext()).queryParam("encounterId", encounterId))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/clinical-documents/{documentId}/sign", documents.get(0).get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedCurrentVersion\":1,\"signatureMeaning\":\"AUTHOR\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SIGNED"));
    }

    private record PharmacyFixture(String stockItemId) {}
    private record Reviewer(String practitionerId, String assignmentId) {}
}
