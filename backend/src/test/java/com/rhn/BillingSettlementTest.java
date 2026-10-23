package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ResetDatabaseBeforeEachTestMethod
class BillingSettlementTest extends RhnIntegrationTestSupport {
    @org.springframework.beans.factory.annotation.Autowired com.rhn.billing.application.MedicationReturnChargeProjector returnProjector;
    @org.springframework.beans.factory.annotation.Autowired com.rhn.platform.eventing.infrastructure.OutboxEventRepository returnEvents;
    @org.springframework.beans.factory.annotation.Autowired com.rhn.shared.json.JsonCodec returnJson;
    @org.springframework.beans.factory.annotation.Autowired org.springframework.jdbc.core.JdbcTemplate returnJdbc;
    private static final String PRODUCT_ID = "362387869795113";
    private static final String PACKAGE_ID = "362387869795403";
    private static final String BUSINESS_DAY = LocalDate.now(ZoneOffset.UTC).toString();

    @org.junit.jupiter.api.Test
    void paymentChannelCapabilitiesExposeInteractionWithoutMerchantCredentials() throws Exception {
        mockMvc.perform(get("/api/billing/payment-methods/CASH/capabilities").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.capabilities.adapterCode").value("CASH"))
                .andExpect(jsonPath("$.capabilities.interaction").value("DIRECT"))
                .andExpect(jsonPath("$.capabilities.querySupported").value(false))
                .andExpect(jsonPath("$.capabilities.merchantId").doesNotExist())
                .andExpect(jsonPath("$.capabilities.privateKeyPath").doesNotExist());
        mockMvc.perform(get("/api/billing/payment-methods/UNREGISTERED/capabilities").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.available").value(false));
    }

    private void verifyReturnEventReplay(String taskId) {
        var stored = returnEvents.findByAggregateIdOrderByRecordedAt(Long.valueOf(taskId)).stream()
                .filter(e -> "MEDICATION_RETURN_POSTED".equals(e.eventType())).findFirst().orElseThrow().envelope(returnJson);
        var data = new java.util.HashMap<>(stored.payload());
        Long eventId = com.rhn.shared.id.GlobalIds.next();
        var replay = new com.rhn.platform.eventing.api.DomainEventEnvelope(eventId, stored.tenantId(), stored.organizationId(),
                stored.eventType(), stored.eventVersion(), stored.aggregateType(), stored.aggregateId(), stored.aggregateVersion(),
                stored.subjectId(), stored.occurredAt(), stored.recordedAt(), stored.actor(), stored.source(), stored.correlationId(), null, data, stored.schemaVersion());
        Object actor = data.remove("processedBy");
        org.junit.jupiter.api.Assertions.assertThrows(com.rhn.shared.api.BusinessException.class, () -> returnProjector.project(replay));
        assertEquals(0, returnJdbc.queryForObject("select count(*) from RHN_INT_EVT_CONSUME where ID_EVT=? and NA_CNSMR=?",
                Integer.class, eventId, "billing-medication-return-charge-v1"));
        data.put("processedBy", actor);
        returnProjector.project(replay); returnProjector.project(replay);
        assertEquals(1, returnJdbc.queryForObject("select count(*) from RHN_INT_EVT_CONSUME where ID_EVT=? and NA_CNSMR=?",
                Integer.class, eventId, "billing-medication-return-charge-v1"));
        assertEquals(1, returnJdbc.queryForObject("select count(*) from RHN_BIL_CHARGE_ITEM where SD_SRC_TYPE='MEDICATION_RETURN' and ID_SRC=?",
                Integer.class, data.get("returnDispenseId")));
    }

    @Test
    void dispense_charge_concurrent_payment_return_refund_and_daily_reconciliation_close_the_ledger() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        PharmacyFixture pharmacy = createPharmacy(suffix);
        JsonNode lot = createLot(pharmacy.stockItemId(), "BIL-" + suffix);
        receive("BIL-RCV-" + suffix, pharmacy, lot.get("id").asString(), "2");
        Reviewer pharmacist = createReviewer(suffix);
        TaskFixture task = createReviewedTask(suffix, pharmacy.stockItemId(), pharmacist, 2);
        reserveAndPrepare(task.taskId(), pharmacist);
        JsonNode dispense = dispense(task.taskId(), "BIL-DSP-" + suffix, "2", pharmacist);

        JsonNode synchronizedCharges = synchronize(task.encounterId(), "BIL-SYNC-" + suffix);
        assertEquals(0, synchronizedCharges.get("createdCharges").asInt());
        assertEquals(1, synchronizedCharges.get("existingCharges").asInt());
        assertEquals(1, synchronizedCharges.at("/statement/charges").size());
        assertEquals(DEPARTMENT, synchronizedCharges.at("/statement/charges/0/ordering/departmentId").asString());
        assertTrue(!synchronizedCharges.at("/statement/charges/0/ordering/doctorName").asString().isBlank());
        assertTrue(synchronizedCharges.at("/statement/charges/0/ordering/serviceType").isNull());
        BigDecimal fullAmount = synchronizedCharges.at("/statement/chargeAmount").decimalValue();
        assertEquals(1, fullAmount.signum());
        JsonNode duplicateSync = synchronize(task.encounterId(), "BIL-SYNC-RETRY-" + suffix);
        assertEquals(0, duplicateSync.get("createdCharges").asInt());
        assertEquals(1, duplicateSync.get("existingCharges").asInt());

        String accountId = synchronizedCharges.at("/statement/accountId").asString();
        JsonNode invoice = json(mockMvc.perform(post("/api/billing/accounts/{accountId}/invoices", accountId).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"invoiceNo":"INV-%s","settlementScene":"OUTPATIENT","terminalScene":"DOCTOR_STATION","terminalCode":"WEB-DOCTOR-WORKSTATION"}
                """.formatted(suffix))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertEquals(fullAmount, invoice.get("netAmount").decimalValue());
        JsonNode duplicateInvoice = issueInvoice(accountId, "INV-" + suffix);
        assertEquals(invoice.get("id").asString(), duplicateInvoice.get("id").asString());
        assertTrue(invoice.path("invoiceNo").asString().matches("INV[0-9]{11}"));
        assertEquals("INV-" + suffix, invoice.path("commandCode").asString());
        assertEquals(invoice.path("invoiceNo").asString(), duplicateInvoice.path("invoiceNo").asString());
        mockMvc.perform(get("/api/billing/settlements/{settlementId}", invoice.get("id").asString())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PRICED"))
                .andExpect(jsonPath("$.settlementScene").value("OUTPATIENT"))
                .andExpect(jsonPath("$.lines.length()").value(1))
                .andExpect(jsonPath("$.tenders.length()").value(0));

        mockMvc.perform(post("/api/billing/settlements/{settlementId}/payment-orders", invoice.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(paymentOrderBody("PAY-INSURANCE-AS-METHOD-" + suffix, fullAmount)
                                .replace("\"CASH\"", "\"MEDICAL_INSURANCE\"")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PAYMENT_METHOD_CLASSIFICATION_INVALID"));

        CompletableFuture<MvcResult> paymentA = paymentOrderAsync(invoice.get("id").asString(),
                "PAY-A-" + suffix, fullAmount);
        CompletableFuture<MvcResult> paymentB = paymentOrderAsync(invoice.get("id").asString(),
                "PAY-B-" + suffix, fullAmount);
        List<MvcResult> paymentRace = List.of(paymentA.join(), paymentB.join());
        assertEquals(1, paymentRace.stream().filter(value -> value.getResponse().getStatus() == 201).count());
        assertEquals(1, paymentRace.stream().filter(value -> value.getResponse().getStatus() == 409).count());
        JsonNode paymentOrder = json(paymentRace.stream().filter(value -> value.getResponse().getStatus() == 201)
                .findFirst().orElseThrow().getResponse().getContentAsString());
        assertEquals("SUCCEEDED", paymentOrder.get("status").asString());
        assertEquals(3, paymentOrder.get("events").size());
        JsonNode duplicateOrder = paymentOrder(invoice.get("id").asString(),
                paymentOrder.get("idempotencyKey").asString(), fullAmount);
        assertEquals(paymentOrder.get("id").asString(), duplicateOrder.get("id").asString());
        assertEquals(true, duplicateOrder.get("duplicate").asBoolean());

        JsonNode paidStatement = json(mockMvc.perform(get("/api/billing/encounters/{encounterId}/statement", task.encounterId())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paymentAmount").value(fullAmount.doubleValue()))
                .andExpect(jsonPath("$.accountBalance").value(0))
                .andExpect(jsonPath("$.payments[0].paymentOrderId").value(paymentOrder.get("id").asLong()))
                .andReturn().getResponse().getContentAsString());
        JsonNode payment = paidStatement.at("/payments/0");
        String day = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).toString();
        JsonNode completed = json(mockMvc.perform(get("/api/billing/settlement-records")
                .param("from", day).param("to", day).param("cashier", "doctor").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(1, completed.size());
        assertEquals(invoice.get("id").asString(), completed.get(0).get("id").asString());
        assertEquals(payment.get("enteredBy").asString(), completed.get(0).get("finalizedBy").asString());
        assertEquals("doctor", completed.get(0).get("cashierUsername").asString());
        assertEquals("CASHIER", completed.get(0).get("terminalScene").asString());
        assertEquals("CASHIER-TEST", completed.get(0).get("terminalCode").asString());
        assertTrue(!completed.get(0).get("cashierName").asString().isBlank());
        // 入口筛选：本结算来自收费处，医生站入口应查不到
        mockMvc.perform(get("/api/billing/settlement-records").param("from", day).param("to", day)
                .param("terminalScene", "DOCTOR_STATION").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get("/api/billing/settlement-records").param("from", day).param("to", day)
                .param("terminalScene", "CASHIER").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        // 办理人选项：测试账号未任收费岗位，但本日办理过结算，应作为非在岗人员出现；换入口后不再出现
        JsonNode cashiers = json(mockMvc.perform(get("/api/billing/settlement-cashiers").param("from", day).param("to", day)
                .with(rhnWorkContext())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode doctorOption = null;
        for (JsonNode option : cashiers) if ("doctor".equals(option.path("username").asString())) doctorOption = option;
        assertTrue(doctorOption != null && !doctorOption.get("active").asBoolean());
        assertEquals(completed.get(0).get("finalizedBy").asString(), doctorOption.get("userId").asString());
        assertEquals("CASHIER", doctorOption.get("terminalScenes").get(0).asString());
        mockMvc.perform(get("/api/billing/settlement-cashiers").param("from", day).param("to", day)
                .param("terminalScene", "SELF_SERVICE").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get("/api/billing/settlement-records").param("from", day).with(rhnWorkContext()))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/billing/settlement-records").param("from", "2020-01-01").param("to", "2020-01-01")
                .with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get("/api/billing/settlement-records").param("from", day).param("to", day).param("cashier", "missing-cashier")
                .with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));

        mockMvc.perform(get("/api/billing/settlements/{settlementId}", invoice.get("id").asString())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SETTLED"))
                .andExpect(jsonPath("$.tenderedAmount").value(fullAmount.doubleValue()))
                .andExpect(jsonPath("$.outstandingAmount").value(0))
                .andExpect(jsonPath("$.tenders.length()").value(1))
                .andExpect(jsonPath("$.tenders[0].tenderType").value("CASH"))
                .andExpect(jsonPath("$.events.length()").value(3));

        returnOne(dispense, "BIL-RET-" + suffix, pharmacist);
        verifyReturnEventReplay(task.taskId());
        JsonNode afterReturn = synchronize(task.encounterId(), "BIL-SYNC-RET-" + suffix);
        assertEquals(0, afterReturn.get("createdCharges").asInt());
        assertEquals(2, afterReturn.get("existingCharges").asInt());
        assertEquals(2, afterReturn.at("/statement/charges").size());
        BigDecimal refundAmount = java.util.stream.StreamSupport
                .stream(afterReturn.at("/statement/charges").spliterator(), false)
                .map(value -> value.get("totalAmount").decimalValue())
                .filter(value -> value.signum() < 0)
                .findFirst().orElseThrow().abs();
        assertEquals(fullAmount.divide(BigDecimal.valueOf(2)), refundAmount);
        JsonNode creditInvoice = issueInvoice(accountId, "CRN-" + suffix);
        assertEquals("CREDIT", creditInvoice.get("invoiceType").asString());
        assertEquals(refundAmount.negate(), creditInvoice.get("netAmount").decimalValue());

        JsonNode refund = refundOrder(payment.get("id").asString(), "RF-" + suffix, refundAmount);
        assertEquals("REFUND", refund.get("orderType").asString());
        assertEquals("REFUNDED", refund.get("status").asString());
        JsonNode duplicateRefund = refundOrder(payment.get("id").asString(), "RF-" + suffix, refundAmount);
        assertEquals(refund.get("id").asString(), duplicateRefund.get("id").asString());
        assertEquals(true, duplicateRefund.get("duplicate").asBoolean());
        mockMvc.perform(post("/api/billing/payments/{paymentId}/refund-orders", payment.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(refundOrderBody("RF-OVER-" + suffix, refundAmount)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REFUND_ORDER_EXCEEDS_ACCOUNT_CREDIT"));

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

    @Test
    void digital_payment_without_embedded_adapter_is_durably_queued_and_remains_pending() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        PharmacyFixture pharmacy = createPharmacy(suffix);
        JsonNode lot = createLot(pharmacy.stockItemId(), "EXT-" + suffix);
        receive("EXT-RCV-" + suffix, pharmacy, lot.get("id").asString(), "1");
        Reviewer pharmacist = createReviewer(suffix);
        TaskFixture task = createReviewedTask(suffix, pharmacy.stockItemId(), pharmacist, 1);
        reserveAndPrepare(task.taskId(), pharmacist);
        dispense(task.taskId(), "EXT-DSP-" + suffix, "1", pharmacist);
        JsonNode synchronizedCharges = synchronize(task.encounterId(), "EXT-SYNC-" + suffix);
        JsonNode invoice = issueInvoice(synchronizedCharges.at("/statement/accountId").asString(), "EXT-INV-" + suffix);

        JsonNode order = json(mockMvc.perform(post("/api/billing/settlements/{settlementId}/payment-orders",
                                invoice.get("id").asString()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(paymentOrderBody("EXT-PAY-" + suffix, invoice.get("netAmount").decimalValue())
                                .replace("\"CASH\"", "\"WECHAT\"")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.events.length()").value(2))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(get("/api/billing/settlements/{settlementId}", invoice.get("id").asString())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAYMENT_PENDING"))
                .andExpect(jsonPath("$.tenders.length()").value(0))
                .andExpect(jsonPath("$.events[1].eventType").value("REQUEST_PAYMENT"));

        mockMvc.perform(get("/api/integration/payments/outbound-messages").with(rhnWorkContext())
                        .queryParam("endpointCode", "PAYMENT_WECHAT")
                        .queryParam("status", "PENDING"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].messageType").value("PAYMENT_ORDER"))
                .andExpect(jsonPath("$[0].businessMessageId").value(order.get("orderNo").asString()))
                .andExpect(jsonPath("$[0].relatedResourceId").value(order.get("id").asLong()));
    }

    @Test
    void cancelled_order_offsets_finalize_zero_settlement_without_payment_and_replay_safely() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        String encounterId = createActiveEncounter(createResident(suffix));
        JsonNode request = json(mockMvc.perform(post("/api/encounters/{id}/service-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"362387869795105","quantity":1,"priceType":"SALE",
                                 "pricingRequired":true,"reason":"零额结算回归","clinicalDescription":"开立后取消"}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/encounters/{id}/service-requests/{requestId}/cancel",
                        encounterId, request.get("id").asString()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"reason":"未执行，取消收费"}
                                """.formatted(request.get("revision").asLong())))
                .andExpect(status().isOk());
        JsonNode before = json(mockMvc.perform(get("/api/billing/encounters/{id}/statement", encounterId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(2, before.get("charges").size());
        assertTrue(before.at("/charges/0/totalAmount").decimalValue().signum() > 0);
        assertEquals(0, before.get("chargeAmount").decimalValue().signum());
        String accountId = before.get("accountId").asString();
        List<Long> chargeIds = java.util.stream.StreamSupport.stream(before.get("charges").spliterator(), false)
                .map(charge -> charge.get("id").asLong()).toList();
        JsonNode invoice = issueInvoice(accountId, "ZERO-INV-" + suffix, chargeIds);
        assertEquals(0, invoice.get("netAmount").decimalValue().signum());
        assertEquals(2, invoice.get("lines").size());
        assertEquals(invoice.get("id").asString(), issueInvoice(accountId, "ZERO-INV-" + suffix, chargeIds).get("id").asString());
        JsonNode settled = json(mockMvc.perform(get("/api/billing/settlements/{id}", invoice.get("id").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SETTLED"))
                .andExpect(jsonPath("$.outstandingAmount").value(0))
                .andExpect(jsonPath("$.tenders").isEmpty())
                .andReturn().getResponse().getContentAsString());
        assertEquals(1L, java.util.stream.StreamSupport.stream(settled.get("events").spliterator(), false)
                .filter(event -> "FINALIZE".equals(event.get("eventType").asString())).count());
        mockMvc.perform(get("/api/billing/encounters/{id}/statement", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.payments").isEmpty())
                .andExpect(jsonPath("$.invoices.length()").value(1))
                .andExpect(jsonPath("$.uninvoicedAmount").value(0));
        var finalized = returnEvents.findByAggregateIdOrderByRecordedAt(invoice.get("id").asLong()).stream()
                .filter(event -> "BILLING_SETTLEMENT_FINALIZED".equals(event.eventType())).toList();
        assertEquals(1, finalized.size());
        var payload = finalized.getFirst().envelope(returnJson).payload();
        assertEquals(List.of(), payload.get("serviceRequests"));
        assertEquals(List.of(), payload.get("medicationRequests"));
    }

    @Test
    void partialSettlementWithSpecificChargeItemIdsLeavesRemainingUninvoiced() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        PharmacyFixture pharmacy = createPharmacy(suffix);
        JsonNode lot = createLot(pharmacy.stockItemId(), "BIL-" + suffix);
        receive("BIL-RCV-" + suffix, pharmacy, lot.get("id").asString(), "2");
        Reviewer pharmacist = createReviewer(suffix);
        TaskFixture task = createReviewedTask(suffix, pharmacy.stockItemId(), pharmacist, 2);
        reserveAndPrepare(task.taskId(), pharmacist);
        dispense(task.taskId(), "BIL-DSP-" + suffix, "2", pharmacist);

        JsonNode synchronizedCharges = synchronize(task.encounterId(), "BIL-SYNC-PARTIAL-" + suffix);
        String accountId = synchronizedCharges.at("/statement/accountId").asString();
        JsonNode statement = synchronizedCharges.get("statement");
        JsonNode charges = statement.get("charges");
        assertTrue(charges.size() >= 1);
        Long firstChargeId = charges.get(0).get("id").asLong();
        BigDecimal firstChargeAmount = charges.get(0).get("totalAmount").decimalValue();

        // Issue partial invoice for only the first charge item
        JsonNode partialInvoice = issueInvoice(accountId, "PART-INV-" + suffix, List.of(firstChargeId));
        assertEquals(firstChargeAmount, partialInvoice.get("netAmount").decimalValue());
        assertEquals(1, partialInvoice.get("lines").size());
        assertEquals(firstChargeId, partialInvoice.get("lines").get(0).get("chargeItemId").asLong());

        // Check statement again: invoiced amount should match the partial invoice
        JsonNode statementAfter = json(mockMvc.perform(get("/api/billing/encounters/{encounterId}/statement", task.encounterId())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertEquals(firstChargeAmount, statementAfter.get("invoicedAmount").decimalValue());
    }

    @Test
    void pendingPaymentOrderSupportsCancellation() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        PharmacyFixture pharmacy = createPharmacy(suffix);
        JsonNode lot = createLot(pharmacy.stockItemId(), "AGG2-" + suffix);
        receive("AGG2-RCV-" + suffix, pharmacy, lot.get("id").asString(), "5");
        Reviewer pharmacist = createReviewer(suffix);
        TaskFixture task = createReviewedTask(suffix, pharmacy.stockItemId(), pharmacist, 1);
        reserveAndPrepare(task.taskId(), pharmacist);
        dispense(task.taskId(), "AGG2-DSP-" + suffix, "1", pharmacist);

        JsonNode synchronizedCharges = synchronize(task.encounterId(), "AGG2-SYNC-" + suffix);
        String accountId = synchronizedCharges.at("/statement/accountId").asString();
        BigDecimal fullAmount = synchronizedCharges.at("/statement/chargeAmount").decimalValue();

        JsonNode invoice = issueInvoice(accountId, "INV-QR-" + suffix);
        String settlementId = invoice.get("id").asString();

        // 1. Create a payment order without embedded adapter (status PENDING)
        String orderBody = """
                {
                  "idempotencyKey": "PAY-PENDING-%s",
                  "businessScene": "OUTPATIENT",
                  "paymentSceneCode": "CASHIER",
                  "paymentMethodCode": "BANK_CARD",
                  "amount": %s,
                  "terminalCode": "CASHIER-WEB"
                }
                """.formatted(suffix, fullAmount);

        JsonNode pendingOrder = json(mockMvc.perform(post("/api/billing/settlements/{settlementId}/payment-orders", settlementId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(orderBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.paymentMethodCode").value("BANK_CARD"))
                .andReturn().getResponse().getContentAsString());

        String paymentOrderId = pendingOrder.get("id").asString();

        // 2. Cashier cancels the pending order
        mockMvc.perform(post("/api/billing/payment-orders/{paymentOrderId}/cancel", paymentOrderId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));

        // 3. Settlement can now be paid with cash instead without conflict
        String cashBody = """
                {
                  "idempotencyKey": "PAY-CASH-RETRY-%s",
                  "businessScene": "OUTPATIENT",
                  "paymentSceneCode": "CASHIER",
                  "paymentMethodCode": "CASH",
                  "amount": %s,
                  "terminalCode": "CASHIER-WEB"
                }
                """.formatted(suffix, fullAmount);

        mockMvc.perform(post("/api/billing/settlements/{settlementId}/payment-orders", settlementId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(cashBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("SUCCEEDED"));
    }

    private JsonNode synchronize(String encounterId, String requestCode) throws Exception {
        return json(mockMvc.perform(post("/api/billing/encounters/{encounterId}/charges/synchronize", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestCode\":\"%s\"}".formatted(requestCode)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode issueInvoice(String accountId, String invoiceNo) throws Exception {
        return issueInvoice(accountId, invoiceNo, null);
    }

    private JsonNode issueInvoice(String accountId, String invoiceNo, List<Long> chargeItemIds) throws Exception {
        String body = chargeItemIds == null ? """
                {"invoiceNo":"%s","issuedAt":"%sT10:30:00Z"}
                """.formatted(invoiceNo, BUSINESS_DAY) : """
                {"invoiceNo":"%s","issuedAt":"%sT10:30:00Z","chargeItemIds":%s}
                """.formatted(invoiceNo, BUSINESS_DAY, chargeItemIds.toString());
        return json(mockMvc.perform(post("/api/billing/accounts/{accountId}/invoices", accountId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private CompletableFuture<MvcResult> paymentOrderAsync(String invoiceId, String idempotencyKey, BigDecimal amount) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                return mockMvc.perform(post("/api/billing/settlements/{settlementId}/payment-orders", invoiceId)
                                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                                .content(paymentOrderBody(idempotencyKey, amount))).andReturn();
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        });
    }

    private JsonNode paymentOrder(String invoiceId, String idempotencyKey, BigDecimal amount) throws Exception {
        return json(mockMvc.perform(post("/api/billing/settlements/{settlementId}/payment-orders", invoiceId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(paymentOrderBody(idempotencyKey, amount)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private String paymentOrderBody(String idempotencyKey, BigDecimal amount) {
        return """
                {
                  "idempotencyKey":"%s","businessScene":"OUTPATIENT","paymentSceneCode":"CASHIER",
                  "paymentMethodCode":"CASH","amount":%s,"terminalCode":"CASHIER-TEST"
                }
                """.formatted(idempotencyKey, amount.toPlainString());
    }

    private JsonNode refundOrder(String paymentId, String idempotencyKey, BigDecimal amount) throws Exception {
        return json(mockMvc.perform(post("/api/billing/payments/{paymentId}/refund-orders", paymentId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(refundOrderBody(idempotencyKey, amount)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private String refundOrderBody(String idempotencyKey, BigDecimal amount) {
        return """
                {
                  "idempotencyKey":"%s","amount":%s,
                  "reason":"患者退药后原路退款","terminalCode":"CASHIER-TEST"
                }
                """.formatted(idempotencyKey, amount.toPlainString());
    }

    private void returnOne(JsonNode dispense, String returnNo, Reviewer pharmacist) throws Exception {
        mockMvc.perform(post("/api/pharmacy/dispenses/{dispenseId}/returns", dispense.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "returnNo":"%s","reasonCode":"PATIENT_NOT_USE",
                                  "occurredAt":"%sT11:00:00Z",
                                  "processorPractitionerId":"%s","processorAssignmentId":"%s",
                                  "description":"患者退回一盒",
                                  "lines":[{"originalDispenseLineId":"%s","quantity":1,"disposition":"RESTOCK"}]
                                }
                                """.formatted(returnNo, BUSINESS_DAY, pharmacist.practitionerId(),
                                pharmacist.assignmentId(), dispense.at("/lines/0/id").asString())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.returnNo").value(org.hamcrest.Matchers.matchesPattern("RET[0-9]{11}")));
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
                                  "substitutionAllowed":false,"selfProvided":false,"allergyReviewConfirmed":true,
                                  "businessDate":"2026-08-27","reason":"M3.4 收费结算验收"
                                }
                                """.formatted(PRODUCT_ID, PACKAGE_ID, quantity)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode task = json(mockMvc.perform(post("/api/pharmacy/requests/{requestId}/intake", request.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"stockItemId\":\"%s\"}".formatted(stockItemId)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/reviews", task.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"result":"PASS","pharmacistPractitionerId":"%s","reviewerAssignmentId":"%s"}
                                """.formatted(reviewer.practitionerId(), reviewer.assignmentId())))
                .andExpect(status().isOk());
        return new TaskFixture(task.get("id").asString(), encounterId);
    }

    private String createResident(String suffix) throws Exception {
        String digits = "%04d".formatted(Math.floorMod(suffix.hashCode(), 10000));
        return json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"收费验收患者","identifiers":[{"system":"9","value":"33010219920202%s","useType":"SECONDARY"}],
                                 "gender":"2","birthDate":"1992-02-02"}
                                """.formatted(digits)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
    }

    private String createActiveEncounter(String residentId) throws Exception {
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(verifiedEncounterStart(encounter.get("id").asString()))
                .andExpect(status().isOk());
        return encounter.get("id").asString();
    }

    private Reviewer createReviewer(String suffix) throws Exception {
        JsonNode practitioner = json(mockMvc.perform(post("/api/platform/practitioners").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"BIL-P-%s\",\"fullName\":\"收费联动药师\",\"sdPractGender\":\"2\"}"
                                .formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode position = json(mockMvc.perform(post("/api/platform/positions").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"BIL-POS-%s\",\"name\":\"药师\",\"sdPositionType\":\"PHARMACY\"}"
                                .formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode employment = json(mockMvc.perform(post("/api/platform/employments").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"practitionerId":"%s","organizationId":"%s","code":"BIL-E-%s",
                                 "sdEmploymentType":"PERMANENT","primaryEmployment":true,"hireDate":"2026-01-01"}
                                """.formatted(practitioner.get("id").asString(), ORGANIZATION, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode assignment = json(mockMvc.perform(post("/api/platform/assignments").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"employmentId":"%s","organizationId":"%s","departmentId":"%s",
                                 "positionId":"%s","code":"BIL-A-%s","sdAssignmentType":"PRIMARY",
                                 "primaryAssignment":true,"validFrom":"2026-01-01"}
                                """.formatted(employment.get("id").asString(), ORGANIZATION, DEPARTMENT,
                                position.get("id").asString(), suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return new Reviewer(practitioner.get("id").asString(), assignment.get("id").asString());
    }

    private PharmacyFixture createPharmacy(String suffix) throws Exception {
        JsonNode site = json(mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"organizationId":"%s","departmentId":"%s","code":"BIL-%s",
                                 "name":"收费验收药房%s","siteType":"PHARMACY","serviceScope":"OUTPATIENT",
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
                                {"code":"PICK-A","name":"A区拣货位","binType":"BIN","stockDefault":"AVAILABLE",
                                 "receiveAllowed":true,"pickAllowed":true,"countAllowed":true,"sortOrder":10}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return new PharmacyFixture(site.get("id").asString(), item.get("id").asString(), bin.get("id").asString());
    }

    @Test
    void payment_order_rejects_client_rounding_that_disagrees_with_configured_floor_rule() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        PharmacyFixture pharmacy = createPharmacy(suffix);
        JsonNode lot = createLot(pharmacy.stockItemId(), "BIL-" + suffix);
        receive("BIL-RCV-" + suffix, pharmacy, lot.get("id").asString(), "2");
        Reviewer pharmacist = createReviewer(suffix);
        TaskFixture task = createReviewedTask(suffix, pharmacy.stockItemId(), pharmacist, 2);
        reserveAndPrepare(task.taskId(), pharmacist);
        dispense(task.taskId(), "BIL-DSP-" + suffix, "2", pharmacist);

        JsonNode synchronizedCharges = synchronize(task.encounterId(), "BIL-SYNC-" + suffix);
        BigDecimal originalAmount = synchronizedCharges.at("/statement/chargeAmount").decimalValue();
        String accountId = synchronizedCharges.at("/statement/accountId").asString();
        JsonNode invoice = issueInvoice(accountId, "INV-" + suffix);
        assertEquals(originalAmount, invoice.get("netAmount").decimalValue());

        BigDecimal roundingAdjustment = new BigDecimal("0.03");
        BigDecimal adjustedAmount = originalAmount.add(roundingAdjustment);

        String paymentBody = """
                {
                  "idempotencyKey":"PAY-ROUND-%s","businessScene":"OUTPATIENT","paymentSceneCode":"CASHIER",
                  "paymentMethodCode":"CASH","amount":%s,"roundingAdjustment":%s,"terminalCode":"CASHIER-TEST"
                }
                """.formatted(suffix, adjustedAmount.toPlainString(), roundingAdjustment.toPlainString());

        mockMvc.perform(post("/api/billing/settlements/{settlementId}/payment-orders", invoice.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(paymentBody))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PAYMENT_ROUNDING_MISMATCH"));

        mockMvc.perform(get("/api/billing/settlements/{settlementId}", invoice.get("id").asString())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PRICED"))
                .andExpect(jsonPath("$.roundingAmount").value(0))
                .andExpect(jsonPath("$.netAmount").value(originalAmount.doubleValue()))
                .andExpect(jsonPath("$.tenderedAmount").value(0))
                .andExpect(jsonPath("$.outstandingAmount").value(originalAmount.doubleValue()));
    }

    @Test
    void partial_and_full_returns_reverse_pre_insurance_relief_and_restore_quota() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        reliefPolicy("PRE_INSURANCE", "HOSPITAL");
        PharmacyFixture pharmacy = createPharmacy(suffix);
        JsonNode lot = createLot(pharmacy.stockItemId(), "RLF-" + suffix);
        receive("RLF-RCV-" + suffix, pharmacy, lot.get("id").asString(), "2");
        Reviewer pharmacist = createReviewer(suffix);
        TaskFixture task = createReviewedTask(suffix, pharmacy.stockItemId(), pharmacist, 2);
        reserveAndPrepare(task.taskId(), pharmacist);
        JsonNode dispense = dispense(task.taskId(), "RLF-DSP-" + suffix, "2", pharmacist);
        JsonNode charges = synchronize(task.encounterId(), "RLF-SYNC-" + suffix);
        String accountId = charges.at("/statement/accountId").asString();
        BigDecimal full = charges.at("/statement/chargeAmount").decimalValue();
        BigDecimal half = full.divide(BigDecimal.valueOf(2));
        BigDecimal initial = cents(full.multiply(new BigDecimal("0.5")));
        BigDecimal retainedRelief = cents(half.multiply(new BigDecimal("0.5")));
        BigDecimal reversed = initial.subtract(retainedRelief);

        JsonNode invoice = issueInvoice(accountId, "RLF-INV-" + suffix);
        assertEquals(0, initial.compareTo(invoice.get("discountAmount").decimalValue()));
        paymentOrder(invoice.get("id").asString(), "RLF-PAY-" + suffix, full.subtract(initial));
        String paymentId = statement(task.encounterId()).at("/payments/0/id").asString();

        returnOne(dispense, "RLF-RET1-" + suffix, pharmacist);
        synchronize(task.encounterId(), "RLF-SYNC-RET1-" + suffix);
        JsonNode credit = issueInvoice(accountId, "RLF-CRN1-" + suffix);
        assertEquals("CREDIT", credit.get("invoiceType").asString());
        assertEquals(0, reversed.negate().compareTo(credit.get("discountAmount").decimalValue()));
        assertEquals(0, half.subtract(reversed).negate().compareTo(credit.get("netAmount").decimalValue()));
        JsonNode reversal = settlementRelief(credit.get("id").asString());
        assertEquals("PRE_INSURANCE", reversal.at("/applications/0/timing").asString());
        assertEquals(0, reversed.negate().compareTo(reversal.at("/applications/0/reliefAmount").decimalValue()));
        assertEquals("APPLIED", settlementRelief(invoice.get("id").asString()).at("/applications/0/status").asString());

        // 退款只覆盖患者实际支付部分：按冲销原额退款会超出账户可退余额。
        mockMvc.perform(post("/api/billing/payments/{paymentId}/refund-orders", paymentId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(refundOrderBody("RLF-RF-OVER-" + suffix, half)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REFUND_ORDER_EXCEEDS_ACCOUNT_CREDIT"));
        refundOrder(paymentId, "RLF-RF1-" + suffix, half.subtract(reversed));
        assertEquals(0, retainedRelief.compareTo(quotaUsed()));

        returnOne(dispense, "RLF-RET2-" + suffix, pharmacist);
        synchronize(task.encounterId(), "RLF-SYNC-RET2-" + suffix);
        JsonNode secondCredit = issueInvoice(accountId, "RLF-CRN2-" + suffix);
        assertEquals(0, retainedRelief.negate().compareTo(secondCredit.get("discountAmount").decimalValue()));
        assertEquals("REVERSED", settlementRelief(invoice.get("id").asString()).at("/applications/0/status").asString());
        assertEquals(0, BigDecimal.ZERO.compareTo(quotaUsed()));
        assertEquals(0, returnJdbc.queryForObject("select QTY_USED from RHN_BIL_RELIEF_QUOTA", Integer.class));
        refundOrder(paymentId, "RLF-RF2-" + suffix, half.subtract(retainedRelief));
        assertEquals(0, BigDecimal.ZERO.compareTo(statement(task.encounterId()).get("accountBalance").decimalValue()));
    }

    @Test
    void partial_return_reverses_post_insurance_relief_as_a_negative_subsidy() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        reliefPolicy("POST_INSURANCE", "GOVERNMENT");
        PharmacyFixture pharmacy = createPharmacy(suffix);
        JsonNode lot = createLot(pharmacy.stockItemId(), "RLP-" + suffix);
        receive("RLP-RCV-" + suffix, pharmacy, lot.get("id").asString(), "2");
        Reviewer pharmacist = createReviewer(suffix);
        TaskFixture task = createReviewedTask(suffix, pharmacy.stockItemId(), pharmacist, 2);
        reserveAndPrepare(task.taskId(), pharmacist);
        JsonNode dispense = dispense(task.taskId(), "RLP-DSP-" + suffix, "2", pharmacist);
        JsonNode charges = synchronize(task.encounterId(), "RLP-SYNC-" + suffix);
        String accountId = charges.at("/statement/accountId").asString();
        BigDecimal full = charges.at("/statement/chargeAmount").decimalValue();
        BigDecimal half = full.divide(BigDecimal.valueOf(2));
        BigDecimal initial = cents(full.multiply(new BigDecimal("0.5")));
        BigDecimal reversed = initial.subtract(cents(half.multiply(new BigDecimal("0.5"))));

        JsonNode invoice = issueInvoice(accountId, "RLP-INV-" + suffix);
        mockMvc.perform(post("/api/billing/settlements/{id}/relief/confirm", invoice.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reliefAmount").value(initial.doubleValue()));
        paymentOrder(invoice.get("id").asString(), "RLP-PAY-" + suffix, full.subtract(initial));
        String paymentId = statement(task.encounterId()).at("/payments/0/id").asString();

        returnOne(dispense, "RLP-RET-" + suffix, pharmacist);
        synchronize(task.encounterId(), "RLP-SYNC-RET-" + suffix);
        JsonNode credit = issueInvoice(accountId, "RLP-CRN-" + suffix);
        assertEquals(0, half.negate().compareTo(credit.get("netAmount").decimalValue()));
        JsonNode settlement = json(mockMvc.perform(get("/api/billing/settlements/{id}", credit.get("id").asString())
                        .with(rhnWorkContext())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals("REVERSAL", settlement.get("settlementType").asString());
        assertEquals("SELF_PAY", settlement.get("settlementMode").asString());
        assertEquals(0, reversed.negate().compareTo(settlement.get("reliefAmount").decimalValue()));
        assertEquals(0, half.subtract(reversed).compareTo(settlement.get("patientAmount").decimalValue()));
        assertEquals("SUBSIDY", settlement.at("/tenders/0/tenderType").asString());
        assertEquals(0, reversed.negate().compareTo(settlement.at("/tenders/0/amount").decimalValue()));
        refundOrder(paymentId, "RLP-RF-" + suffix, half.subtract(reversed));
        assertEquals(0, BigDecimal.ZERO.compareTo(statement(task.encounterId()).get("accountBalance").decimalValue()));
    }

    private void reliefPolicy(String timing, String sponsor) throws Exception {
        JsonNode created = json(mockMvc.perform(post("/api/billing/relief/policies").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"RLF-%s","name":"退费冲销测试","draft":{"timing":"%s","sponsor":"%s",
                                 "scope":{"scenes":["OUTPATIENT"]},"effectiveFrom":"2026-01-01","insuredApplicable":true,
                                 "quotaPeriod":"YEAR","periodMaxAmount":100000,
                                 "rules":[{"feeScope":"ALL","method":"RATIO","ratio":0.5}],
                                 "qualifications":[{"source":"ALL"}]}}
                                """.formatted(timing, timing, sponsor)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/billing/relief/policies/{id}/publish", created.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":" + created.get("revision").asLong() + "}"))
                .andExpect(status().isOk());
    }

    private JsonNode settlementRelief(String settlementId) throws Exception {
        return json(mockMvc.perform(get("/api/billing/settlements/{id}/relief", settlementId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode statement(String encounterId) throws Exception {
        return json(mockMvc.perform(get("/api/billing/encounters/{encounterId}/statement", encounterId)
                .with(rhnWorkContext())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private BigDecimal quotaUsed() {
        return returnJdbc.queryForObject("select AMT_USED from RHN_BIL_RELIEF_QUOTA", BigDecimal.class);
    }

    private static BigDecimal cents(BigDecimal value) { return value.setScale(2, java.math.RoundingMode.HALF_UP); }

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
