package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class BillingSettlementTest extends RhnIntegrationTestSupport {
    private static final String PRODUCT_ID = "362387869795113";
    private static final String PACKAGE_ID = "362387869795403";
    private static final String BUSINESS_DAY = "2026-09-15";

    @Test
    void dispense_charge_concurrent_payment_return_refund_and_daily_reconciliation_close_the_ledger() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        PharmacyFixture pharmacy = createPharmacy(suffix);
        JsonNode lot = createLot(pharmacy.stockItemId(), "BIL-" + suffix);
        receive("BIL-RCV-" + suffix, pharmacy, lot.get("id").asText(), "2");
        Reviewer pharmacist = createReviewer(suffix);
        TaskFixture task = createReviewedTask(suffix, pharmacy.stockItemId(), pharmacist, 2);
        reserveAndPrepare(task.taskId(), pharmacist);
        JsonNode dispense = dispense(task.taskId(), "BIL-DSP-" + suffix, "2", pharmacist);

        JsonNode synchronizedCharges = synchronize(task.encounterId(), "BIL-SYNC-" + suffix);
        assertEquals(1, synchronizedCharges.get("createdCharges").asInt());
        assertEquals(1, synchronizedCharges.at("/statement/charges").size());
        BigDecimal fullAmount = synchronizedCharges.at("/statement/chargeAmount").decimalValue();
        assertEquals(1, fullAmount.signum());
        JsonNode duplicateSync = synchronize(task.encounterId(), "BIL-SYNC-RETRY-" + suffix);
        assertEquals(0, duplicateSync.get("createdCharges").asInt());
        assertEquals(1, duplicateSync.get("existingCharges").asInt());

        String accountId = synchronizedCharges.at("/statement/accountId").asText();
        JsonNode invoice = issueInvoice(accountId, "INV-" + suffix);
        assertEquals(fullAmount, invoice.get("netAmount").decimalValue());
        JsonNode duplicateInvoice = issueInvoice(accountId, "INV-" + suffix);
        assertEquals(invoice.get("id").asText(), duplicateInvoice.get("id").asText());

        CompletableFuture<MvcResult> paymentA = paymentAsync(invoice.get("id").asText(),
                "PAY-A-" + suffix, fullAmount);
        CompletableFuture<MvcResult> paymentB = paymentAsync(invoice.get("id").asText(),
                "PAY-B-" + suffix, fullAmount);
        List<MvcResult> paymentRace = List.of(paymentA.join(), paymentB.join());
        assertEquals(1, paymentRace.stream().filter(value -> value.getResponse().getStatus() == 201).count());
        assertEquals(1, paymentRace.stream().filter(value -> value.getResponse().getStatus() == 409).count());
        JsonNode payment = json(paymentRace.stream().filter(value -> value.getResponse().getStatus() == 201)
                .findFirst().orElseThrow().getResponse().getContentAsString());
        mockMvc.perform(get("/api/billing/encounters/{encounterId}/statement", task.encounterId())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paymentAmount").value(fullAmount.doubleValue()))
                .andExpect(jsonPath("$.accountBalance").value(0));

        returnOne(dispense, "BIL-RET-" + suffix, pharmacist);
        JsonNode afterReturn = synchronize(task.encounterId(), "BIL-SYNC-RET-" + suffix);
        assertEquals(1, afterReturn.get("createdCharges").asInt());
        assertEquals(2, afterReturn.at("/statement/charges").size());
        BigDecimal refundAmount = afterReturn.at("/statement/charges/1/totalAmount").decimalValue().abs();
        assertEquals(fullAmount.divide(BigDecimal.valueOf(2)), refundAmount);
        JsonNode creditInvoice = issueInvoice(accountId, "CRN-" + suffix);
        assertEquals("CREDIT", creditInvoice.get("invoiceType").asText());
        assertEquals(refundAmount.negate(), creditInvoice.get("netAmount").decimalValue());

        JsonNode refund = refund(payment.get("id").asText(), "RF-" + suffix, refundAmount);
        assertEquals("REFUND", refund.get("paymentType").asText());
        JsonNode duplicateRefund = refund(payment.get("id").asText(), "RF-" + suffix, refundAmount);
        assertEquals(refund.get("id").asText(), duplicateRefund.get("id").asText());
        mockMvc.perform(post("/api/billing/payments/{paymentId}/refunds", payment.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(refundBody("RF-OVER-" + suffix, refundAmount)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REFUND_EXCEEDS_ACCOUNT_CREDIT"));

        mockMvc.perform(get("/api/billing/encounters/{encounterId}/statement", task.encounterId())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.charges.length()").value(2))
                .andExpect(jsonPath("$.invoices.length()").value(2))
                .andExpect(jsonPath("$.payments.length()").value(2))
                .andExpect(jsonPath("$.ledgerEntries.length()").value(4))
                .andExpect(jsonPath("$.refundAmount").value(refundAmount.doubleValue()))
                .andExpect(jsonPath("$.accountBalance").value(0));

        mockMvc.perform(get("/api/billing/reconciliation/daily").with(rhnWorkContext())
                        .queryParam("businessDate", BUSINESS_DAY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sourceEventCount").value(2))
                .andExpect(jsonPath("$.chargedEventCount").value(2))
                .andExpect(jsonPath("$.discrepancyCount").value(0))
                .andExpect(jsonPath("$.ledgerBalance").value(0))
                .andExpect(jsonPath("$.lines[*].status").value(
                        org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is("MATCHED"))));
    }

    private JsonNode synchronize(String encounterId, String requestCode) throws Exception {
        return json(mockMvc.perform(post("/api/billing/encounters/{encounterId}/charges/synchronize", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestCode\":\"%s\"}".formatted(requestCode)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode issueInvoice(String accountId, String invoiceNo) throws Exception {
        return json(mockMvc.perform(post("/api/billing/accounts/{accountId}/invoices", accountId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"invoiceNo":"%s","issuedAt":"%sT10:30:00Z"}
                                """.formatted(invoiceNo, BUSINESS_DAY)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private CompletableFuture<MvcResult> paymentAsync(String invoiceId, String paymentNo, BigDecimal amount) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                return mockMvc.perform(post("/api/billing/invoices/{invoiceId}/payments", invoiceId)
                                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                                .content(paymentBody(paymentNo, amount))).andReturn();
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        });
    }

    private String paymentBody(String paymentNo, BigDecimal amount) {
        return """
                {
                  "paymentNo":"%s","paymentMethodCode":"CASH","amount":%s,
                  "paidAt":"%sT10:40:00Z","externalTransactionNo":"EXT-%s",
                  "description":"门诊窗口收费"
                }
                """.formatted(paymentNo, amount.toPlainString(), BUSINESS_DAY, paymentNo);
    }

    private JsonNode refund(String paymentId, String refundNo, BigDecimal amount) throws Exception {
        return json(mockMvc.perform(post("/api/billing/payments/{paymentId}/refunds", paymentId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(refundBody(refundNo, amount)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private String refundBody(String refundNo, BigDecimal amount) {
        return """
                {
                  "refundNo":"%s","amount":%s,"refundedAt":"%sT11:30:00Z",
                  "externalTransactionNo":"EXT-%s","reason":"患者退药后原路退款"
                }
                """.formatted(refundNo, amount.toPlainString(), BUSINESS_DAY, refundNo);
    }

    private void returnOne(JsonNode dispense, String returnNo, Reviewer pharmacist) throws Exception {
        mockMvc.perform(post("/api/pharmacy/dispenses/{dispenseId}/returns", dispense.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "returnNo":"%s","reasonCode":"PATIENT_NOT_USE",
                                  "occurredAt":"%sT11:00:00Z",
                                  "processorPractitionerId":"%s","processorAssignmentId":"%s",
                                  "description":"患者退回一盒",
                                  "lines":[{"originalDispenseLineId":"%s","quantity":1,"disposition":"RESTOCK"}]
                                }
                                """.formatted(returnNo, BUSINESS_DAY, pharmacist.practitionerId(),
                                pharmacist.assignmentId(), dispense.at("/lines/0/id").asText())))
                .andExpect(status().isCreated());
    }

    private JsonNode dispense(String taskId, String requestCode, String quantity, Reviewer pharmacist) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/dispenses", taskId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "requestCode":"%s","operationQuantity":%s,
                                  "occurredAt":"%sT10:00:00Z",
                                  "dispenserPractitionerId":"%s","dispenserAssignmentId":"%s",
                                  "description":"收费联动发药"
                                }
                                """.formatted(requestCode, quantity, BUSINESS_DAY,
                                pharmacist.practitionerId(), pharmacist.assignmentId())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private void reserveAndPrepare(String taskId, Reviewer pharmacist) throws Exception {
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/reservations", taskId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expiryMinutes\":30}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/picking/complete", taskId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"pickerPractitionerId":"%s","pickerAssignmentId":"%s","description":"配药完成"}
                                """.formatted(pharmacist.practitionerId(), pharmacist.assignmentId())))
                .andExpect(status().isOk());
    }

    private TaskFixture createReviewedTask(String suffix, String stockItemId, Reviewer reviewer, int quantity) throws Exception {
        String residentId = createResident(suffix);
        String encounterId = createActiveEncounter(residentId);
        JsonNode request = json(mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "catalogItemId":"%s","packageId":"%s","quantity":%d,
                                  "substitutionAllowed":false,"selfProvided":false,
                                  "businessDate":"2026-08-27","reason":"M3.4 收费结算验收"
                                }
                                """.formatted(PRODUCT_ID, PACKAGE_ID, quantity)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode task = json(mockMvc.perform(post("/api/pharmacy/requests/{requestId}/intake", request.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"stockItemId\":\"%s\"}".formatted(stockItemId)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/reviews", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"result":"PASS","pharmacistPractitionerId":"%s","reviewerAssignmentId":"%s"}
                                """.formatted(reviewer.practitionerId(), reviewer.assignmentId())))
                .andExpect(status().isOk());
        return new TaskFixture(task.get("id").asText(), encounterId);
    }

    private String createResident(String suffix) throws Exception {
        String digits = "%04d".formatted(Math.floorMod(suffix.hashCode(), 10000));
        return json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"收费验收患者","nationalId":"33010219920202%s",
                                 "gender":"FEMALE","birthDate":"1992-02-02"}
                                """.formatted(digits)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private String createActiveEncounter(String residentId) throws Exception {
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/encounters/{id}/start", encounter.get("id").asText()).with(rhnWorkContext()))
                .andExpect(status().isOk());
        return encounter.get("id").asText();
    }

    private Reviewer createReviewer(String suffix) throws Exception {
        JsonNode practitioner = json(mockMvc.perform(post("/api/platform/practitioners").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"BIL-P-%s\",\"fullName\":\"收费联动药师\",\"sdPractGender\":\"FEMALE\"}"
                                .formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode position = json(mockMvc.perform(post("/api/platform/positions").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"BIL-POS-%s\",\"name\":\"药师\",\"sdPositionType\":\"PHARMACY\"}"
                                .formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode employment = json(mockMvc.perform(post("/api/platform/employments").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"practitionerId":"%s","organizationId":"%s","code":"BIL-E-%s",
                                 "sdEmploymentType":"PERMANENT","primaryEmployment":true,"hireDate":"2026-01-01"}
                                """.formatted(practitioner.get("id").asText(), ORGANIZATION, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode assignment = json(mockMvc.perform(post("/api/platform/assignments").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"employmentId":"%s","organizationId":"%s","departmentId":"%s",
                                 "positionId":"%s","code":"BIL-A-%s","sdAssignmentType":"PRIMARY",
                                 "primaryAssignment":true,"validFrom":"2026-01-01"}
                                """.formatted(employment.get("id").asText(), ORGANIZATION, DEPARTMENT,
                                position.get("id").asText(), suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return new Reviewer(practitioner.get("id").asText(), assignment.get("id").asText());
    }

    private PharmacyFixture createPharmacy(String suffix) throws Exception {
        JsonNode site = json(mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"organizationId":"%s","departmentId":"%s","code":"BIL-%s",
                                 "name":"收费验收药房%s","siteType":"PHARMACY","serviceScope":"OUTPATIENT",
                                 "validFrom":"2026-01-01"}
                                """.formatted(ORGANIZATION, DEPARTMENT, suffix, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode item = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{siteId}/stock-items", site.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","packageId":"%s","issuePolicy":"FEFO",
                                 "negativeAllowed":false,"lotRequired":true,"traceRequired":true,
                                 "splitAllowed":true,"coldChain":false,"controlled":false,"highAlert":false}
                                """.formatted(PRODUCT_ID, PACKAGE_ID)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode bin = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{siteId}/stock-bins", site.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"PICK-A","name":"A区拣货位","binType":"BIN","stockDefault":"AVAILABLE",
                                 "receiveAllowed":true,"pickAllowed":true,"countAllowed":true,"sortOrder":10}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return new PharmacyFixture(site.get("id").asText(), item.get("id").asText(), bin.get("id").asText());
    }

    private JsonNode createLot(String stockItemId, String lotNo) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/stock-items/{stockItemId}/lots", stockItemId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"lotNo":"%s","productionDate":"2026-01-01","expiryDate":"2027-12-31",
                                 "manufacturerNameSnapshot":"示例制药企业","qualityStatus":"QUALIFIED"}
                                """.formatted(lotNo)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private void receive(String requestCode, PharmacyFixture fixture, String lotId, String quantity) throws Exception {
        mockMvc.perform(post("/api/pharmacy/inventory/receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"requestCode":"%s","sourceCode":"OPENING-%s","stockItemId":"%s",
                                 "stockBinId":"%s","stockLotId":"%s","operationQuantity":%s,"unitCost":8.50,
                                 "occurredAt":"%sT08:00:00Z","description":"M3.4 期初验收"}
                                """.formatted(requestCode, requestCode, fixture.stockItemId(), fixture.binId(),
                                lotId, quantity, BUSINESS_DAY)))
                .andExpect(status().isCreated());
    }

    private record PharmacyFixture(String siteId, String stockItemId, String binId) {}
    private record Reviewer(String practitionerId, String assignmentId) {}
    private record TaskFixture(String taskId, String encounterId) {}
}
