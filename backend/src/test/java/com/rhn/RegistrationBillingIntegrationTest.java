package com.rhn;

import com.rhn.billing.api.FiscalReceiptAdapter;
import com.rhn.billing.api.InsuranceSettlementAdapter;
import com.rhn.billing.api.PaymentChannelAdapter;
import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.time.Instant;
import java.math.BigDecimal;
import java.util.UUID;
import java.util.List;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
@Import(RegistrationBillingIntegrationTest.ReceiptAdapterConfiguration.class)
@Tag("outpatient-main-flow")
class RegistrationBillingIntegrationTest extends RhnIntegrationTestSupport {
    private static final String REGISTRATION_SERVICE = "362387869795104";
    @Autowired JdbcTemplate jdbc;

    @Test
    void priced_schedule_is_held_then_cash_payment_idempotently_creates_registration_and_queue() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String residentId = createResident(suffix);
        String scheduleId = createTodaySchedule(suffix, 1);
        String intentCode = "REG-INTENT-" + suffix;

        JsonNode intent = createIntent(residentId, scheduleId, intentCode);
        assertEquals("PAYMENT_PENDING", intent.get("status").asText());
        assertEquals("SELF_PAY", intent.get("settlementMode").asText());
        assertEquals(0, new java.math.BigDecimal("10.00").compareTo(intent.get("feeAmount").decimalValue()));
        String holdId = intent.get("slotHoldId").asText();
        assertEquals(1, jdbc.queryForObject("select QTY_HELD from RHN_SC_SCHED_SLOT_POOL where ID_SVC_SCHED = ?",
                Integer.class, Long.valueOf(scheduleId)));
        assertEquals("ACTIVE", jdbc.queryForObject("select SD_STATUS as status from RHN_SC_SCHED_SLOT_HOLD where ID_SCHED_SLOT_HOLD = ?",
                String.class, Long.valueOf(holdId)));

        JsonNode replay = createIntent(residentId, scheduleId, intentCode);
        assertEquals(intent.get("id").asText(), replay.get("id").asText());
        assertEquals(true, replay.get("duplicate").asBoolean());

        JsonNode order = json(mockMvc.perform(post("/api/billing/settlements/{settlementId}/payment-orders",
                                intent.get("settlementId").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "idempotencyKey":"REG-PAY-%s","businessScene":"REGISTRATION",
                                  "paymentSceneCode":"CASHIER","paymentMethodCode":"CASH","amount":10.00,
                                  "terminalCode":"REGISTRATION-TEST"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("SUCCEEDED"))
                .andReturn().getResponse().getContentAsString());

        JsonNode completed = json(mockMvc.perform(get("/api/billing/registration-intents/{intentId}",
                                intent.get("id").asText()).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.paymentOrderId").value(order.get("id").asLong()))
                .andExpect(jsonPath("$.encounterId").isNotEmpty())
                .andReturn().getResponse().getContentAsString());

        assertEquals(0, jdbc.queryForObject("select QTY_HELD from RHN_SC_SCHED_SLOT_POOL where ID_SVC_SCHED = ?",
                Integer.class, Long.valueOf(scheduleId)));
        assertEquals(1, jdbc.queryForObject("select QTY_OCCUPIED from RHN_SC_SCHED_SLOT_POOL where ID_SVC_SCHED = ?",
                Integer.class, Long.valueOf(scheduleId)));
        assertEquals("CONSUMED", jdbc.queryForObject("select SD_STATUS as status from RHN_SC_SCHED_SLOT_HOLD where ID_SCHED_SLOT_HOLD = ?",
                String.class, Long.valueOf(holdId)));
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_SC_PAT_REG where ID_ENC = ?",
                Integer.class, completed.get("encounterId").asLong()));

        String externalTransactionNo = jdbc.queryForObject(
                "select CD_EXT_TXN_NO as external_transaction_no from RHN_BIL_PAY where ID_PAY_ORDER = ?", String.class,
                order.get("id").asLong());
        JsonNode reconciliation = json(mockMvc.perform(post("/api/billing/reconciliation-batches")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"commandCode":"RECON-%s","reconciliationType":"PAYMENT_CHANNEL",
                                 "sourceCode":"TEST_CASH_CHANNEL","paymentMethodCode":"CASH",
                                 "businessDate":"%s","currencyCode":"CNY"}
                                """.formatted(suffix, LocalDate.now())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("IMPORTED"))
                .andReturn().getResponse().getContentAsString());
        JsonNode reconciled = json(mockMvc.perform(post("/api/billing/reconciliation-batches/{id}/statement",
                        reconciliation.get("id").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"externalBatchNo":"EXT-BATCH-%s","transactions":[
                                  {"externalTransactionNo":"%s","transactionType":"PAYMENT",
                                   "status":"SUCCESS","amount":10.00,"currencyCode":"CNY"},
                                  {"externalTransactionNo":"CHANNEL-ONLY-%s","transactionType":"PAYMENT",
                                   "status":"SUCCESS","amount":2.00,"currencyCode":"CNY"}
                                ]}
                                """.formatted(suffix, externalTransactionNo, suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DIFFERENCE"))
                .andExpect(jsonPath("$.localCount").value(1)).andExpect(jsonPath("$.externalCount").value(2))
                .andExpect(jsonPath("$.differenceCount").value(1))
                .andExpect(jsonPath("$.differenceAmount").value(2.0))
                .andReturn().getResponse().getContentAsString());
        JsonNode differenceItem = null;
        for (JsonNode item : reconciled.get("items")) {
            if ("EXTERNAL_ONLY".equals(item.get("matchType").asText())) differenceItem = item;
        }
        if (differenceItem == null) throw new AssertionError("未生成渠道单边对账差异");
        mockMvc.perform(post("/api/billing/reconciliation-items/{id}/resolve", differenceItem.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"RESOLVE-RECON-%s\",\"reason\":\"渠道测试流水，不入院内账\",\"ignore\":true}"
                                .formatted(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RESOLVED"));

        JsonNode receipt = json(mockMvc.perform(post("/api/billing/settlements/{settlementId}/receipts",
                                intent.get("settlementId").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"idempotencyKey":"RC-%s","receiptType":"RECEIPT","issueChannel":"CASHIER",
                                 "payerName":"挂号收费验收患者"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("ISSUED"))
                .andExpect(jsonPath("$.externalReceiptNo").isNotEmpty())
                .andExpect(jsonPath("$.controlledObjectReference").isNotEmpty())
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/billing/receipts/{receiptId}/prints", receipt.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"PRINT-%s\"}".formatted(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.events[1].eventType").value("ISSUE"))
                .andExpect(jsonPath("$.events[2].eventType").value("PRINT"));
        mockMvc.perform(post("/api/billing/settlements/{settlementId}/receipts",
                                intent.get("settlementId").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"idempotencyKey":"RC-%s","receiptType":"RECEIPT","issueChannel":"CASHIER",
                                 "payerName":"挂号收费验收患者"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(receipt.get("id").asLong()))
                .andExpect(jsonPath("$.duplicate").value(true));
        mockMvc.perform(post("/api/billing/receipts/{receiptId}/void", receipt.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"VOID-%s\",\"reason\":\"测试作废\"}".formatted(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("VOIDED"));

        JsonNode pendingReceipt = json(mockMvc.perform(post("/api/billing/settlements/{settlementId}/receipts",
                                intent.get("settlementId").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"idempotencyKey":"ASYNC-RC-%s","receiptType":"MEDICAL_E_INVOICE",
                                 "issueChannel":"CASHIER","fiscalAuthorityCode":"TEST_PENDING"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("REQUESTED"))
                .andExpect(jsonPath("$.externalReceiptNo").isNotEmpty())
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(get("/api/billing/receipts/recovery-worklist").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(pendingReceipt.get("id").asLong()));
        mockMvc.perform(post("/api/billing/receipts/recovery").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"batchCode\":\"RC-RECOVERY-%s\",\"limit\":20}".formatted(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].receiptId").value(pendingReceipt.get("id").asLong()))
                .andExpect(jsonPath("$[0].status").value("ISSUED"))
                .andExpect(jsonPath("$[0].accepted").value(true));
        JsonNode redReceipt = json(mockMvc.perform(post("/api/billing/receipts/{receiptId}/red-flush",
                                pendingReceipt.get("id").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"RED-%s\",\"reason\":\"测试全额红冲\"}".formatted(suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("RED_FLUSHED"))
                .andExpect(jsonPath("$.reversesReceiptId").value(pendingReceipt.get("id").asLong()))
                .andExpect(jsonPath("$.amount").value(-10.0))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/billing/receipts/{receiptId}/red-flush", pendingReceipt.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"RED-%s\",\"reason\":\"测试全额红冲\"}".formatted(suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(redReceipt.get("id").asLong()))
                .andExpect(jsonPath("$.duplicate").value(true));
        mockMvc.perform(get("/api/billing/receipts/{receiptId}", pendingReceipt.get("id").asText())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ISSUED"));
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_SC_QUEUE_TICKET qt join RHN_SC_PAT_REG pr " +
                        "on pr.ID_TNT = qt.ID_TNT and qt.SD_SOURCE_TYPE = 'PAT_REG' " +
                        "and pr.ID_PAT_REG = qt.ID_SOURCE where pr.ID_ENC = ?",
                Integer.class, completed.get("encounterId").asLong()));

        mockMvc.perform(post("/api/billing/payment-orders/{paymentOrderId}/business-completion/retry",
                        order.get("id").asText()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUCCEEDED"));
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_SC_PAT_REG where ID_ENC = ?",
                Integer.class, completed.get("encounterId").asLong()));

        Instant closeFrom = Instant.now().minusSeconds(3600);
        Instant closeTo = Instant.now().plusSeconds(3600);
        JsonNode cashierClose = json(mockMvc.perform(post("/api/billing/cashier-closes").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "commandCode":"CLOSE-%s","terminalCode":"REGISTRATION-TEST",
                                  "rangeFrom":"%s","rangeTo":"%s",
                                  "actualAmounts":[{"paymentMethodCode":"CASH","paymentType":"PAYMENT","amount":9.00}]
                                }
                                """.formatted(suffix, closeFrom, closeTo)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("CALCULATED"))
                .andExpect(jsonPath("$.transactionCount").value(1))
                .andExpect(jsonPath("$.expectedAmount").value(10.0))
                .andExpect(jsonPath("$.actualAmount").value(9.0))
                .andExpect(jsonPath("$.differenceAmount").value(-1.0))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/billing/cashier-closes/{closeId}/confirm", cashierClose.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"CONFIRM-%s\"}".formatted(suffix)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/billing/cashier-closes/{closeId}/confirm", cashierClose.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"CONFIRM-%s\",\"differenceReason\":\"现金盘点短款1元\"}"
                                .formatted(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.differenceReason").value("现金盘点短款1元"));
        mockMvc.perform(post("/api/billing/cashier-closes/{closeId}/reverse", cashierClose.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"REVERSE-CLOSE-%s\",\"reason\":\"测试撤销交班\"}"
                                .formatted(suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.reversesCloseId").value(cashierClose.get("id").asLong()))
                .andExpect(jsonPath("$.expectedAmount").value(-10.0));
        mockMvc.perform(get("/api/billing/cashier-closes/{closeId}", cashierClose.get("id").asText())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REVERSED"));
    }

    @Test
    void department_schedule_completes_paid_registration_without_a_practitioner_snapshot() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String residentId = createResident(suffix);
        String scheduleId = createTodayDepartmentSchedule(suffix, 2);
        JsonNode intent = createIntent(residentId, scheduleId, "DEPT-INTENT-" + suffix);

        mockMvc.perform(post("/api/billing/settlements/{settlementId}/payment-orders",
                                intent.get("settlementId").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "idempotencyKey":"DEPT-PAY-%s","businessScene":"REGISTRATION",
                                  "paymentSceneCode":"CASHIER","paymentMethodCode":"CASH","amount":10.00,
                                  "terminalCode":"REGISTRATION-TEST"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("SUCCEEDED"));

        JsonNode completed = json(mockMvc.perform(get("/api/billing/registration-intents/{intentId}",
                                intent.get("id").asText()).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.encounterId").isNotEmpty())
                .andReturn().getResponse().getContentAsString());

        assertEquals("DEPARTMENT", jdbc.queryForObject(
                "select SD_REG_SCOPE from RHN_SC_SVC_SCHED where ID_SVC_SCHED = ?", String.class, Long.valueOf(scheduleId)));
        assertEquals(1, jdbc.queryForObject(
                "select count(*) from RHN_SC_APPT where ID_SVC_SCHED = ? and ID_PRACT is null " +
                        "and NA_PRACT_SNAP is null", Integer.class, Long.valueOf(scheduleId)));
        assertEquals(1, jdbc.queryForObject(
                "select count(*) from RHN_SC_PAT_REG where ID_SVC_SCHED = ? and ID_ENC = ?",
                Integer.class, Long.valueOf(scheduleId), completed.get("encounterId").asLong()));
    }

    @Test
    void direct_zero_fee_registration_bypasses_payment_but_still_uses_durable_intent() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String residentId = createResident(suffix);
        JsonNode value = json(mockMvc.perform(post("/api/billing/registration-intents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "idempotencyCode":"DIRECT-%s","registrationSource":"DIRECT","visitType":"GENERAL"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.feeAmount").value(0))
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.settlementId").doesNotExist())
                .andExpect(jsonPath("$.encounterId").isNotEmpty())
                .andReturn().getResponse().getContentAsString());
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_SC_PAT_REG where ID_ENC = ?",
                Integer.class, value.get("encounterId").asLong()));
    }

    @Test
    void direct_zero_fee_registration_with_medical_insurance() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String residentId = createResident(suffix);
        long coverageId = GlobalIds.next();
        jdbc.update("insert into RHN_INS_PAT_COVER (ID_PAT_COVER, REVISION, ID_TNT, ID_PAT, CD_COVER_TYPE, " +
                        "NA_PAYER, CD_MEMBER_NO, FG_PRIMARY_FLAG, DA_VALID_FROM, SD_STATUS, " +
                        "DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED) " +
                        "values (?, 0, ?, ?, 'BASIC', '测试医保基金', 'MASKED', true, ?, 'ACTIVE', ?, 'test', ?, 'test')",
                coverageId, Long.valueOf(TENANT), Long.valueOf(residentId), LocalDate.now(), Instant.now(), Instant.now());
        mockMvc.perform(post("/api/billing/registration-intents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "idempotencyCode":"DIRECT-INS-%s","registrationSource":"DIRECT","visitType":"GENERAL",
                                  "settlementMode":"MEDICAL_INSURANCE","coverageId":"%s"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix, coverageId)))
                .andExpect(status().isCreated());
    }

    @Test
    void register_demo_zhang_jianguo() throws Exception {
        mockMvc.perform(post("/api/billing/registration-intents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"362387869900101",
                                  "organizationId":"362387869790211",
                                  "departmentId":"362387869790212",
                                  "idempotencyCode":"REG-INTENT-DEMO-TEST-1",
                                  "registrationSource":"DIRECT",
                                  "visitType":"GENERAL",
                                  "settlementMode":"MEDICAL_INSURANCE",
                                  "coverageId":"362387869900301"
                                }
                                """))
                .andExpect(status().isCreated());
    }

    @Test
    void active_encounter_is_rejected_before_slot_hold_and_financial_facts_are_created() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String residentId = createResident(suffix);
        String scheduleId = createTodaySchedule(suffix, 1);
        mockMvc.perform(post("/api/billing/registration-intents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "idempotencyCode":"ACTIVE-DIRECT-%s","registrationSource":"DIRECT","visitType":"GENERAL"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("COMPLETED"));

        int accountCount = jdbc.queryForObject("select count(*) from RHN_BIL_PAT_ACCT", Integer.class);
        int chargeCount = jdbc.queryForObject("select count(*) from RHN_BIL_CHARGE_ITEM", Integer.class);
        int settlementCount = jdbc.queryForObject("select count(*) from RHN_BIL_STL", Integer.class);
        int intentCount = jdbc.queryForObject("select count(*) from RHN_BIL_REG_BIL_INTENT", Integer.class);

        mockMvc.perform(post("/api/billing/registration-intents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "scheduleId":"%s","idempotencyCode":"ACTIVE-PRICED-%s",
                                  "registrationSource":"WINDOW","visitType":"GENERAL"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, scheduleId, suffix)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ENCOUNTER_ACTIVE_DUPLICATE"));

        assertEquals(accountCount, jdbc.queryForObject("select count(*) from RHN_BIL_PAT_ACCT", Integer.class));
        assertEquals(chargeCount, jdbc.queryForObject("select count(*) from RHN_BIL_CHARGE_ITEM", Integer.class));
        assertEquals(settlementCount, jdbc.queryForObject("select count(*) from RHN_BIL_STL", Integer.class));
        assertEquals(intentCount, jdbc.queryForObject("select count(*) from RHN_BIL_REG_BIL_INTENT", Integer.class));
        assertEquals(0, jdbc.queryForObject("select QTY_HELD from RHN_SC_SCHED_SLOT_POOL where ID_SVC_SCHED = ?",
                Integer.class, Long.valueOf(scheduleId)));
    }

    @Test
    void unserved_paid_registration_is_atomically_refunded_cancelled_and_returns_the_slot() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String residentId = createResident(suffix);
        String scheduleId = createTodaySchedule(suffix, 1);
        JsonNode intent = createIntent(residentId, scheduleId, "CANCEL-INTENT-" + suffix);
        json(mockMvc.perform(post("/api/billing/settlements/{settlementId}/payment-orders",
                                intent.get("settlementId").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "idempotencyKey":"CANCEL-PAY-%s","businessScene":"REGISTRATION",
                                  "paymentSceneCode":"CASHIER","paymentMethodCode":"CASH","amount":10.00,
                                  "terminalCode":"REGISTRATION-TEST"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("SUCCEEDED"))
                .andReturn().getResponse().getContentAsString());
        JsonNode completed = json(mockMvc.perform(get("/api/billing/registration-intents/{intentId}",
                                intent.get("id").asText()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"))
                .andReturn().getResponse().getContentAsString());
        String encounterId = completed.get("encounterId").asText();
        String command = "WITHDRAW-" + suffix;
        String body = """
                {"commandCode":"%s","reason":"患者主动取消就诊","terminalCode":"REGISTRATION-TEST"}
                """.formatted(command);

        mockMvc.perform(post("/api/encounters/{encounterId}/cancel", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.completed").value(true))
                .andExpect(jsonPath("$.encounterStatus").value("CANCELLED"))
                .andExpect(jsonPath("$.registrationStatus").value("CANCELLED"))
                .andExpect(jsonPath("$.queueStatus").value("CANCELLED"))
                .andExpect(jsonPath("$.appointmentStatus").value("CANCELLED"))
                .andExpect(jsonPath("$.billingStatus").value("CANCELLED"))
                .andExpect(jsonPath("$.refundStatus").value("REFUNDED"));
        mockMvc.perform(post("/api/encounters/{encounterId}/cancel", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.completed").value(true))
                .andExpect(jsonPath("$.refundStatus").value("REFUNDED"));
        String replayWithNewCommand = """
                {"commandCode":"WITHDRAW-REPLAY-%s","reason":"前台重复确认退号","terminalCode":"REGISTRATION-TEST"}
                """.formatted(suffix);
        mockMvc.perform(post("/api/encounters/{encounterId}/cancel", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(replayWithNewCommand))
                .andExpect(status().isOk()).andExpect(jsonPath("$.completed").value(true))
                .andExpect(jsonPath("$.billingStatus").value("CANCELLED"))
                .andExpect(jsonPath("$.refundStatus").value("REFUNDED"));

        assertEquals("CANCELLED", jdbc.queryForObject(
                "select SD_STATUS as status from RHN_BIL_REG_BIL_INTENT where ID_REG_BIL_INTENT = ?", String.class, intent.get("id").asLong()));
        assertEquals("CANCELLED", jdbc.queryForObject(
                "select SD_STATUS as status from RHN_SC_PAT_REG where ID_ENC = ?", String.class, Long.valueOf(encounterId)));
        assertEquals("CANCELLED", jdbc.queryForObject(
                "select q.SD_STATUS as status from RHN_SC_QUEUE_TICKET q join RHN_SC_PAT_REG r " +
                        "on r.ID_TNT = q.ID_TNT and q.SD_SOURCE_TYPE = 'PAT_REG' and r.ID_PAT_REG = q.ID_SOURCE " +
                        "where r.ID_ENC = ?", String.class, Long.valueOf(encounterId)));
        assertEquals(0, jdbc.queryForObject("select QTY_OCCUPIED from RHN_SC_SCHED_SLOT_POOL where ID_SVC_SCHED = ?",
                Integer.class, Long.valueOf(scheduleId)));
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_BIL_CHARGE_ITEM " +
                        "where SD_SRC_TYPE = 'REGISTRATION_REVERSAL' and ID_SRC = ?",
                Integer.class, intent.get("id").asLong()));
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_BIL_PAY_ORDER " +
                        "where ID_PAT_ACCT = ? and SD_ORDER_TYPE = 'REFUND'",
                Integer.class, completed.get("patientAccountId").asLong()));
        BigDecimal balance = jdbc.queryForObject("select coalesce(sum(case when SD_DIRECTION = 'DEBIT' then AMT_ENTRY " +
                        "else -AMT_ENTRY end), 0) from RHN_BIL_LEDGER_ENTRY where ID_PAT_ACCT = ?",
                BigDecimal.class, completed.get("patientAccountId").asLong());
        assertEquals(0, balance.compareTo(BigDecimal.ZERO));
    }

    @Test
    void started_encounter_cannot_be_withdrawn() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String residentId = createResident(suffix);
        JsonNode intent = json(mockMvc.perform(post("/api/billing/registration-intents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "idempotencyCode":"STARTED-%s","registrationSource":"DIRECT","visitType":"GENERAL"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("COMPLETED"))
                .andReturn().getResponse().getContentAsString());
        String encounterId = intent.get("encounterId").asText();
        mockMvc.perform(verifiedEncounterStart(encounterId))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"));
        mockMvc.perform(post("/api/encounters/{encounterId}/cancel", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"STARTED-CANCEL-%s\",\"reason\":\"测试错误退号\"}"
                                .formatted(suffix)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ENCOUNTER_ALREADY_IN_SERVICE"));
        assertEquals("REGISTERED", jdbc.queryForObject(
                "select SD_STATUS as status from RHN_SC_PAT_REG where ID_ENC = ?", String.class, Long.valueOf(encounterId)));
    }

    @Test
    void concurrent_last_slot_has_exactly_one_durable_hold() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String scheduleId = createTodaySchedule(suffix, 1);
        String residentA = createResident("A" + suffix);
        String residentB = createResident("B" + suffix);
        CompletableFuture<MvcResult> first = createIntentAsync(residentA, scheduleId, "RACE-A-" + suffix);
        CompletableFuture<MvcResult> second = createIntentAsync(residentB, scheduleId, "RACE-B-" + suffix);
        List<MvcResult> results = List.of(first.join(), second.join());
        assertEquals(1, results.stream().filter(value -> value.getResponse().getStatus() == 201).count());
        assertEquals(1, results.stream().filter(value -> value.getResponse().getStatus() == 409).count());
        assertEquals(1, jdbc.queryForObject("select QTY_HELD from RHN_SC_SCHED_SLOT_POOL where ID_SVC_SCHED = ?",
                Integer.class, Long.valueOf(scheduleId)));
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_SC_SCHED_SLOT_HOLD " +
                        "where ID_SVC_SCHED = ? and SD_STATUS = 'ACTIVE'", Integer.class, Long.valueOf(scheduleId)));
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_BIL_REG_BIL_INTENT where ID_SVC_SCHED = ?",
                Integer.class, Long.valueOf(scheduleId)));
        JsonNode winningIntent = json(results.stream().filter(value -> value.getResponse().getStatus() == 201)
                .findFirst().orElseThrow().getResponse().getContentAsString());
        mockMvc.perform(post("/api/billing/registration-intents/{intentId}/cancel", winningIntent.get("id").asText())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        assertEquals(0, jdbc.queryForObject("select QTY_HELD from RHN_SC_SCHED_SLOT_POOL where ID_SVC_SCHED = ?",
                Integer.class, Long.valueOf(scheduleId)));
        assertEquals("RELEASED", jdbc.queryForObject("select SD_STATUS as status from RHN_SC_SCHED_SLOT_HOLD where ID_SCHED_SLOT_HOLD = ?",
                String.class, winningIntent.get("slotHoldId").asLong()));
    }

    @Test
    void asynchronous_registration_payment_keeps_hold_and_does_not_create_encounter_before_callback() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String residentId = createResident(suffix);
        JsonNode intent = createIntent(residentId, createTodaySchedule(suffix, 1), "ASYNC-" + suffix);
        JsonNode pendingOrder = json(mockMvc.perform(post("/api/billing/settlements/{settlementId}/payment-orders",
                                intent.get("settlementId").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "idempotencyKey":"ASYNC-PAY-%s","businessScene":"REGISTRATION",
                                  "paymentSceneCode":"CASHIER","paymentMethodCode":"WECHAT","amount":10.00
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PENDING"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(get("/api/billing/registration-intents/{intentId}", intent.get("id").asText())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PAYMENT_PENDING"))
                .andExpect(jsonPath("$.paymentOrderId").value(pendingOrder.get("id").asLong()))
                .andExpect(jsonPath("$.encounterId").doesNotExist());
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_SC_SCHED_SLOT_HOLD " +
                        "where ID_SCHED_SLOT_HOLD = ? and SD_STATUS = 'ACTIVE'", Integer.class,
                intent.get("slotHoldId").asLong()));
        assertEquals(0, jdbc.queryForObject("select count(*) from RHN_SC_PAT_REG where ID_PAT = ?",
                Integer.class, Long.valueOf(residentId)));

        mockMvc.perform(get("/api/billing/payment-orders/recovery-worklist").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(pendingOrder.get("id").asLong()));
        mockMvc.perform(post("/api/billing/payment-orders/recovery").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"batchCode\":\"PAY-RECOVERY-%s\",\"limit\":20}".formatted(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].paymentOrderId")
                        .value(pendingOrder.get("id").asLong()))
                .andExpect(jsonPath("$[0].status").value("SUCCEEDED"))
                .andExpect(jsonPath("$[0].accepted").value(true));
        mockMvc.perform(get("/api/billing/registration-intents/{intentId}", intent.get("id").asText())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.encounterId").isNotEmpty());
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_SC_PAT_REG where ID_PAT = ?",
                Integer.class, Long.valueOf(residentId)));
    }

    @Test
    void insurance_funds_reduce_patient_payment_and_mixed_tenders_finalize_the_same_settlement() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String residentId = createResident(suffix);
        long coverageId = GlobalIds.next();
        jdbc.update("insert into RHN_INS_PAT_COVER (ID_PAT_COVER, REVISION, ID_TNT, ID_PAT, CD_COVER_TYPE, " +
                        "NA_PAYER, CD_MEMBER_NO, FG_PRIMARY_FLAG, DA_VALID_FROM, SD_STATUS, " +
                        "DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED) " +
                        "values (?, 0, ?, ?, 'BASIC', '测试医保基金', 'MASKED', true, ?, 'ACTIVE', ?, 'test', ?, 'test')",
                coverageId, Long.valueOf(TENANT), Long.valueOf(residentId), LocalDate.now(), Instant.now(), Instant.now());
        String scheduleId = createTodaySchedule(suffix, 1);
        JsonNode intent = json(mockMvc.perform(post("/api/billing/registration-intents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "scheduleId":"%s","idempotencyCode":"INS-%s",
                                  "registrationSource":"WINDOW","visitType":"GENERAL",
                                  "settlementMode":"MEDICAL_INSURANCE","coverageId":"%s"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, scheduleId, suffix, coverageId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.settlementMode").value("MEDICAL_INSURANCE"))
                .andExpect(jsonPath("$.coverageId").value(coverageId))
                .andExpect(jsonPath("$.coverageTypeCode").value("BASIC"))
                .andExpect(jsonPath("$.coveragePayerName").value("测试医保基金"))
                .andReturn().getResponse().getContentAsString());
        JsonNode settlement = json(mockMvc.perform(get("/api/billing/settlements/{settlementId}",
                                intent.get("settlementId").asText()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        long settlementLineId = settlement.at("/lines/0/id").asLong();
        JsonNode claim = json(mockMvc.perform(post("/api/billing/settlements/{settlementId}/insurance/pre-settlements",
                                intent.get("settlementId").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "coverageId":"%s","idempotencyKey":"INS-PRE-%s","regionCode":"TEST_REGION",
                                  "insuranceTypeCode":"BASIC","organizationCode":"HOSP-001",
                                  "departmentCode":"DEPT-001","practitionerCode":"DOC-001",
                                  "diagnosisPayloadDigest":"SHA256-TEST-%s",
                                  "lines":[{"settlementLineId":"%s","insuranceItemCode":"INS-REG-001"}]
                                }
                                """.formatted(coverageId, suffix, suffix, settlementLineId)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PRE_SETTLEMENT_PENDING"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(get("/api/billing/insurance-claims/recovery-worklist").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].claimId").value(claim.get("claimId").asLong()));
        mockMvc.perform(post("/api/billing/insurance-claims/recovery").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"batchCode\":\"INS-RECOVERY-%s\",\"limit\":20}".formatted(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].claimId").value(claim.get("claimId").asLong()))
                .andExpect(jsonPath("$[0].status").value("PRE_SETTLED"))
                .andExpect(jsonPath("$[0].accepted").value(true));
        mockMvc.perform(post("/api/billing/insurance-claims/{claimId}/settle", claim.get("claimId").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"INS-SETTLE-%s\"}".formatted(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SETTLED"));

        mockMvc.perform(post("/api/billing/settlements/{settlementId}/payment-orders",
                                intent.get("settlementId").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"idempotencyKey":"INS-OVERPAY-%s","businessScene":"REGISTRATION",
                                 "paymentSceneCode":"CASHIER","paymentMethodCode":"CASH","amount":10.00}
                                """.formatted(suffix)))
                .andExpect(status().isConflict());
        mockMvc.perform(post("/api/billing/settlements/{settlementId}/payment-orders",
                                intent.get("settlementId").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"idempotencyKey":"INS-CASH-%s","businessScene":"REGISTRATION",
                                 "paymentSceneCode":"CASHIER","paymentMethodCode":"CASH","amount":3.00}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("SUCCEEDED"));
        mockMvc.perform(get("/api/billing/settlements/{settlementId}", intent.get("settlementId").asText())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SETTLED"))
                .andExpect(jsonPath("$.tenderedAmount").value(10.0))
                .andExpect(jsonPath("$.outstandingAmount").value(0.0))
                .andExpect(jsonPath("$.tenders.length()").value(3));
        BigDecimal balance = jdbc.queryForObject("select coalesce(sum(case when SD_DIRECTION = 'DEBIT' then AMT_ENTRY " +
                        "else -AMT_ENTRY end), 0) from RHN_BIL_LEDGER_ENTRY where ID_PAT_ACCT = ?", BigDecimal.class,
                intent.get("patientAccountId").asLong());
        assertEquals(0, balance.compareTo(BigDecimal.ZERO));
        assertEquals(2, jdbc.queryForObject("select count(*) from RHN_BIL_LEDGER_ENTRY where ID_PAT_ACCT = ? " +
                        "and ID_CLAIM_RESP is not null", Integer.class, intent.get("patientAccountId").asLong()));

        mockMvc.perform(post("/api/billing/insurance-claims/{claimId}/reverse", claim.get("claimId").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"INS-REVERSE-%s\",\"reason\":\"整单退费前撤销医保结算\"}"
                                .formatted(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REVERSED"))
                .andExpect(jsonPath("$.currentOperation").value("REVERSE"))
                .andExpect(jsonPath("$.reversalReason").value("整单退费前撤销医保结算"))
                .andExpect(jsonPath("$.reversedAt").exists());
        mockMvc.perform(post("/api/billing/insurance-claims/{claimId}/reverse", claim.get("claimId").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"INS-REVERSE-%s\",\"reason\":\"整单退费前撤销医保结算\"}"
                                .formatted(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.duplicate").value(true));
        mockMvc.perform(post("/api/billing/insurance-claims/{claimId}/reverse", claim.get("claimId").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"INS-REVERSE-%s\",\"reason\":\"不一致原因\"}"
                                .formatted(suffix)))
                .andExpect(status().isConflict());
        mockMvc.perform(get("/api/billing/settlements/{settlementId}", intent.get("settlementId").asText())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PARTIAL"))
                .andExpect(jsonPath("$.insuranceAmount").value(0.0))
                .andExpect(jsonPath("$.patientAmount").value(10.0))
                .andExpect(jsonPath("$.tenderedAmount").value(3.0))
                .andExpect(jsonPath("$.outstandingAmount").value(7.0))
                .andExpect(jsonPath("$.tenders.length()").value(5));
        balance = jdbc.queryForObject("select coalesce(sum(case when SD_DIRECTION = 'DEBIT' then AMT_ENTRY " +
                        "else -AMT_ENTRY end), 0) from RHN_BIL_LEDGER_ENTRY where ID_PAT_ACCT = ?", BigDecimal.class,
                intent.get("patientAccountId").asLong());
        assertEquals(0, balance.compareTo(new BigDecimal("7.000000")));
        assertEquals(2, jdbc.queryForObject("select count(*) from RHN_BIL_LEDGER_ENTRY where ID_PAT_ACCT = ? " +
                        "and ID_CLAIM_RESP is not null and SD_DIRECTION = 'DEBIT' " +
                        "and ID_LEDGER_ENTRY_REVERSES is not null",
                Integer.class, intent.get("patientAccountId").asLong()));
    }

    private JsonNode createIntent(String residentId, String scheduleId, String code) throws Exception {
        return json(mockMvc.perform(post("/api/billing/registration-intents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "scheduleId":"%s","idempotencyCode":"%s",
                                  "registrationSource":"WINDOW","visitType":"GENERAL"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, scheduleId, code)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private CompletableFuture<MvcResult> createIntentAsync(String residentId, String scheduleId, String code) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                return mockMvc.perform(post("/api/billing/registration-intents").with(rhnWorkContext())
                                .contentType(MediaType.APPLICATION_JSON).content("""
                                        {
                                          "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                          "scheduleId":"%s","idempotencyCode":"%s",
                                          "registrationSource":"WINDOW","visitType":"GENERAL"
                                        }
                                        """.formatted(residentId, ORGANIZATION, DEPARTMENT, scheduleId, code)))
                        .andReturn();
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        });
    }

    private String createResident(String suffix) throws Exception {
        String digits = "%04d".formatted(Math.floorMod(suffix.hashCode(), 10000));
        return json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"挂号收费验收患者","identifiers":[{"system":"9","value":"33010219920303%s","useType":"SECONDARY"}],
                                 "gender":"FEMALE","birthDate":"1992-03-03"}
                                """.formatted(digits)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private String createTodaySchedule(String suffix, int capacity) throws Exception {
        LocalDate today = LocalDate.now();
        JsonNode generated = json(mockMvc.perform(post("/api/outpatient/scheduling/quick-schedules")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "practitionerId":"362387869790223","catalogItemId":"%s",
                                  "dateFrom":"%s","dateTo":"%s","weekdays":[%d],"dayParts":["MORNING"],
                                  "morningStart":"00:00","morningEnd":"23:59","capacity":%d,
                                  "locationName":"挂号收费验收诊室","idempotencyCode":"REG-SCHEDULE-%s"
                                }
                                """.formatted(REGISTRATION_SERVICE, today, today,
                                today.getDayOfWeek().getValue(), capacity, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return generated.at("/schedules/0/id").asText();
    }

    private String createTodayDepartmentSchedule(String suffix, int capacity) throws Exception {
        LocalDate today = LocalDate.now();
        JsonNode generated = json(mockMvc.perform(post("/api/outpatient/scheduling/quick-schedules")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "registrationScope":"DEPARTMENT","catalogItemId":"%s",
                                  "dateFrom":"%s","dateTo":"%s","weekdays":[%d],"dayParts":["MORNING"],
                                  "morningStart":"00:00","morningEnd":"23:59","capacity":%d,
                                  "locationName":"科室号挂号验收诊室","idempotencyCode":"DEPT-SCHEDULE-%s"
                                }
                                """.formatted(REGISTRATION_SERVICE, today, today,
                                today.getDayOfWeek().getValue(), capacity, suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.schedules[0].sdRegistrationScope").value("DEPARTMENT"))
                .andExpect(jsonPath("$.schedules[0].practitionerId").doesNotExist())
                .andReturn().getResponse().getContentAsString());
        return generated.at("/schedules/0/id").asText();
    }

    @TestConfiguration
    static class ReceiptAdapterConfiguration {
        @Bean
        @Order(Ordered.HIGHEST_PRECEDENCE)
        FiscalReceiptAdapter pendingThenQueryableReceiptAdapter() {
            return new FiscalReceiptAdapter() {
                @Override public boolean supports(String authority, String type) {
                    return "TEST_PENDING".equals(authority);
                }
                @Override public ReceiptResult issue(ReceiptInstruction input) {
                    return new ReceiptResult(ReceiptResult.Outcome.PENDING, "EXT-" + input.receiptRequestNo(),
                            null, null, null, null, null, "ASYNC_ACCEPTED", "财政平台处理中", null);
                }
                @Override public ReceiptResult query(String requestNo, String externalNo, String correlationId) {
                    return new ReceiptResult(ReceiptResult.Outcome.ISSUED, externalNo, "TEST", requestNo,
                            "VERIFY", "fiscal-object:" + requestNo, Instant.now(), null, null, null);
                }
                @Override public ReceiptResult voidReceipt(ReceiptAction input) {
                    return new ReceiptResult(ReceiptResult.Outcome.VOIDED, input.externalReceiptNo(), null,
                            null, null, null, Instant.now(), null, null, null);
                }
                @Override public ReceiptResult redFlush(ReceiptAction input) {
                    return new ReceiptResult(ReceiptResult.Outcome.RED_FLUSHED, "RED-" + input.receiptRequestNo(),
                            "TEST", input.receiptRequestNo(), null, null, Instant.now(), null, null, null);
                }
            };
        }

        @Bean
        InsuranceSettlementAdapter testInsuranceSettlementAdapter() {
            return new InsuranceSettlementAdapter() {
                @Override public boolean supports(String region, String type) {
                    return "TEST_REGION".equals(region) && "BASIC".equals(type);
                }
                @Override public InsuranceResult preSettle(InsuranceInstruction input) {
                    return new InsuranceResult(InsuranceResult.Outcome.PENDING, "PRE-" + input.settlementNo(),
                            "PRE-MSG-" + input.settlementNo(), BigDecimal.ZERO, BigDecimal.ZERO,
                            BigDecimal.ZERO, BigDecimal.ZERO, "CNY", "ASYNC_ACCEPTED", "医保平台处理中", null);
                }
                @Override public InsuranceResult settle(InsuranceInstruction input, String preSettlementNo) {
                    return success("SET-" + input.settlementNo(), "SET-MSG-" + input.settlementNo());
                }
                @Override public InsuranceResult query(InsuranceQuery input) {
                    return success(input.externalSettlementNo() == null ? input.externalPreSettlementNo()
                            : input.externalSettlementNo(), "QUERY-MSG-" + input.claimNo());
                }
                @Override public InsuranceResult reverse(InsuranceReversal input) {
                    return new InsuranceResult(InsuranceResult.Outcome.SUCCEEDED, input.originalExternalSettlementNo(),
                            "REVERSE-MSG-" + input.settlementNo(), new BigDecimal("6.000000"),
                            new BigDecimal("1.000000"), new BigDecimal("3.000000"),
                            BigDecimal.ZERO.setScale(6), "CNY", null, null, null);
                }
                private InsuranceResult success(String externalNo, String messageId) {
                    return new InsuranceResult(InsuranceResult.Outcome.SUCCEEDED, externalNo, messageId,
                            new BigDecimal("6.000000"), new BigDecimal("1.000000"),
                            new BigDecimal("3.000000"), BigDecimal.ZERO.setScale(6), "CNY", null, null, null);
                }
            };
        }

        @Bean
        PaymentChannelAdapter pendingThenQueryablePaymentAdapter() {
            return new PaymentChannelAdapter() {
                @Override public boolean supports(String method) { return "WECHAT".equals(method); }
                @Override public InitiationResult initiate(PaymentInstruction input) {
                    return InitiationResult.pending("WX-" + input.orderNo());
                }
                @Override public RefundResult refund(RefundInstruction input) {
                    return RefundResult.pending("WX-RF-" + input.orderNo());
                }
                @Override public QueryResult query(QueryInstruction input) {
                    return QueryResult.succeeded(input.externalOrderNo(), "WX-TXN-" + input.orderNo(),
                            input.expectedAmount());
                }
            };
        }
    }
}
