package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class InpatientBillingFlowTest extends RhnIntegrationTestSupport {
    private static final String RESIDENT = "362387869790213";
    private static final String BED = "362387869898514";
    private static final String SERVICE_ITEM = "362387869795101";

    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void posts_one_bed_charge_per_business_day_and_same_day_transfer_does_not_double_charge() throws Exception {
        JsonNode admission = postJson("/api/inpatient/admissions", """
                {"residentId":"%s","bedId":"%s","admissionTypeCode":"GENERAL",
                 "admissionSourceCode":"DIRECT","admissionReason":"床日记账测试",
                 "commandCode":"IP-BED-DAY-ADMIT"}
                """.formatted(RESIDENT, "362387869898512"), 201);
        String episodeId = admission.get("id").asString();
        String encounterId = admission.get("encounterId").asString();
        Instant admittedAt = LocalDate.now().minusDays(2).atTime(8, 0)
                .atZone(ZoneId.of("Asia/Shanghai")).toInstant();
        jdbcTemplate.update("update RHN_VIS_CARE_EPISODE set DT_START = ? where ID_CARE_EPISODE = ?", admittedAt, Long.valueOf(episodeId));
        jdbcTemplate.update("update RHN_VIS_ENC set DT_REGD = ?, DT_STARTED = ? where ID_ENC = ?",
                admittedAt, admittedAt, Long.valueOf(encounterId));
        jdbcTemplate.update("update RHN_VIS_ENC_LOC_HIST set DT_START = ? where ID_ENC = ?",
                admittedAt, Long.valueOf(encounterId));

        postJson("/api/inpatient/episodes/" + episodeId + "/transfer", """
                {"expectedRevision":0,"targetBedId":"362387869898513","reason":"同日转床验证",
                 "commandCode":"IP-BED-DAY-TRANSFER"}
                """, 200);
        String postingBody = """
                {"throughDate":"%s","currencyCode":"CNY","commandCode":"IP-BED-DAY-POST"}
                """.formatted(LocalDate.now());
        JsonNode posting = postJson("/api/inpatient/episodes/" + episodeId + "/billing/bed-days/post",
                postingBody, 200);
        assertEquals(3, posting.get("createdCount").asInt());
        assertEquals(0, posting.get("existingCount").asInt());
        assertEquals(0, new BigDecimal("60").compareTo(posting.get("postedAmount").decimalValue()));
        assertEquals(0, new BigDecimal("60").compareTo(posting.at("/account/postedChargeAmount").decimalValue()));
        assertEquals(3, count("select count(*) from RHN_VIS_INP_BED_DAY_FACT where ID_CARE_EPISODE = ?", episodeId));
        assertEquals(1, count("select count(*) from RHN_VIS_INP_BED_DAY_FACT where ID_CARE_EPISODE = ? "
                + "and DA_BIZ = current_date and ID_BED_LOC = 362387869898513", episodeId));
        assertEquals(3, count("select count(*) from RHN_BIL_CHARGE_ITEM where ID_ENC = ? "
                + "and SD_SRC_TYPE = 'INPATIENT_BED_DAY' and PRICE_UNIT = 20 "
                + "and ID_PRICE = 362387869898522 and SN_PRICE_VER = 0", encounterId));

        JsonNode replay = postJson("/api/inpatient/episodes/" + episodeId + "/billing/bed-days/post",
                postingBody, 200);
        assertEquals(0, replay.get("createdCount").asInt());
        assertEquals(3, replay.get("existingCount").asInt());
        assertEquals(3, count("select count(*) from RHN_BIL_CHARGE_ITEM where ID_ENC = ? "
                + "and SD_SRC_TYPE = 'INPATIENT_BED_DAY'", encounterId));
    }

    @Test
    void bed_day_posting_blocks_without_an_active_price_and_rolls_back_the_fact() throws Exception {
        JsonNode admission = postJson("/api/inpatient/admissions", """
                {"residentId":"%s","bedId":"%s","admissionTypeCode":"GENERAL",
                 "admissionSourceCode":"DIRECT","admissionReason":"床日缺价门禁测试",
                 "commandCode":"IP-BED-NO-PRICE-ADMIT"}
                """.formatted(RESIDENT, BED), 201);
        String episodeId = admission.get("id").asString();
        String encounterId = admission.get("encounterId").asString();
        jdbcTemplate.update("update RHN_BD_CATALOG_PRICE set SD_STATUS = 'INACTIVE' where ID_CATALOG_PRICE = 362387869898522");
        try {
            mockMvc.perform(post("/api/inpatient/episodes/{episodeId}/billing/bed-days/post", episodeId)
                            .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                    {"throughDate":"%s","currencyCode":"CNY",
                                     "commandCode":"IP-BED-NO-PRICE-POST"}
                                    """.formatted(LocalDate.now())))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("INPATIENT_BED_DAY_PRICE_MISSING"));
            assertEquals(0, count("select count(*) from RHN_VIS_INP_BED_DAY_FACT where ID_CARE_EPISODE = ?", episodeId));
            assertEquals(0, count("select count(*) from RHN_BIL_CHARGE_ITEM where ID_ENC = ? "
                    + "and SD_SRC_TYPE = 'INPATIENT_BED_DAY'", encounterId));
        } finally {
            jdbcTemplate.update("update RHN_BD_CATALOG_PRICE set SD_STATUS = 'ACTIVE' where ID_CATALOG_PRICE = 362387869898522");
        }
    }

    @Test
    void daily_statement_attributes_planned_order_estimates_to_each_execution_date() throws Exception {
        JsonNode admission = postJson("/api/inpatient/admissions", """
                {"residentId":"%s","bedId":"%s","admissionTypeCode":"GENERAL",
                 "admissionSourceCode":"DIRECT","admissionReason":"日清单预计费用测试",
                 "commandCode":"IP-DAILY-ESTIMATE-ADMIT"}
                """.formatted(RESIDENT, BED), 201);
        String episodeId = admission.get("id").asString();
        JsonNode order = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"SERVICE","durationType":"TEMPORARY",
                 "catalogItemId":"%s","instructions":"明日住院血细胞分析",
                 "commandCode":"IP-DAILY-ESTIMATE-ORDER"}
                """.formatted(episodeId, SERVICE_ITEM), 201);
        String requestId = order.get("id").asString();
        postJson("/api/inpatient/orders/" + requestId + "/sign",
                command(0, "IP-DAILY-ESTIMATE-SIGN"), 200);
        postJson("/api/inpatient/orders/" + requestId + "/verify",
                command(1, "IP-DAILY-ESTIMATE-VERIFY"), 200);
        LocalDate plannedDate = LocalDate.now(ZoneId.of("Asia/Shanghai")).plusDays(1);
        Instant plannedAt = plannedDate.atTime(9, 0).atZone(ZoneId.of("Asia/Shanghai")).toInstant();
        postJson("/api/inpatient/orders/" + requestId + "/plans", """
                {"expectedRevision":2,"plannedTimes":["%s"],
                 "commandCode":"IP-DAILY-ESTIMATE-PLAN"}
                """.formatted(plannedAt), 200);

        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/billing/daily-statement", episodeId)
                        .param("businessDate", plannedDate.toString()).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.postedAmount").value(0.0))
                .andExpect(jsonPath("$.estimatedAmount").value(18.0))
                .andExpect(jsonPath("$.categorySummaries[?(@.category == 'ORDER')].postedAmount").value(0.0))
                .andExpect(jsonPath("$.categorySummaries[?(@.category == 'ORDER')].estimatedAmount").value(18.0))
                .andExpect(jsonPath("$.categorySummaries[?(@.category == 'ORDER')].amount").value(18.0))
                .andExpect(jsonPath("$.lines[?(@.sourceType == 'INPATIENT_ORDER_TASK_ESTIMATE')].sourceId")
                        .isNotEmpty());
    }

    @Test
    void account_deposit_order_and_bed_estimates_warn_without_blocking_clinical_discharge() throws Exception {
        JsonNode admission = postJson("/api/inpatient/admissions", """
                {"residentId":"%s","bedId":"%s","admissionTypeCode":"GENERAL",
                 "admissionSourceCode":"DIRECT","admissionReason":"住院费用工作面测试",
                 "commandCode":"IP-BILLING-ADMIT"}
                """.formatted(RESIDENT, BED), 201);
        String episodeId = admission.get("id").asString();
        String encounterId = admission.get("encounterId").asString();
        String executedTaskId = completeServiceOrder(episodeId);
        postJson("/api/inpatient/order-tasks/" + executedTaskId + "/execute", """
                {"expectedRevision":0,"outcomeCode":"COMPLETED","commandCode":"IP-BILLING-ORDER-EXECUTE"}
                """, 200);
        skipServiceOrder(episodeId);

        JsonNode initialAccount = json(mockMvc.perform(
                        get("/api/inpatient/episodes/{episodeId}/billing", episodeId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.patientAccountId").isNotEmpty())
                .andExpect(jsonPath("$.accountStatus").value("OPEN"))
                .andExpect(jsonPath("$.postedChargeAmount").value(18.0))
                .andExpect(jsonPath("$.estimatedOrderAmount").value(0.0))
                .andExpect(jsonPath("$.estimatedBedAmount").value(20.0))
                .andExpect(jsonPath("$.estimatedTotalAmount").value(38.0))
                .andExpect(jsonPath("$.depositAmount").value(0))
                .andExpect(jsonPath("$.estimatedOutstandingAmount").value(38.0))
                .andExpect(jsonPath("$.paymentDue").value(true))
                .andExpect(jsonPath("$.financialWarningOnly").value(true))
                .andExpect(jsonPath("$.costLines[?(@.sourceType == 'INPATIENT_ORDER_TASK')].itemCode")
                        .value("SRV-CBC"))
                .andExpect(jsonPath("$.costLines[?(@.category == 'BED')].unitCode").value("床日"))
                .andReturn().getResponse().getContentAsString());
        String accountId = initialAccount.get("patientAccountId").asString();

        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/billing/daily-statement", episodeId)
                        .param("businessDate", LocalDate.now().toString()).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.postedAmount").value(18.0))
                .andExpect(jsonPath("$.estimatedAmount").value(20.0))
                .andExpect(jsonPath("$.categorySummaries[?(@.category == 'ORDER')].postedAmount").value(18.0))
                .andExpect(jsonPath("$.categorySummaries[?(@.category == 'ORDER')].estimatedAmount").value(0.0))
                .andExpect(jsonPath("$.categorySummaries[?(@.category == 'BED')].postedAmount").value(0.0))
                .andExpect(jsonPath("$.categorySummaries[?(@.category == 'BED')].estimatedAmount").value(20.0));

        String depositBody = """
                {"paymentNo":"IP-DEP-0001","amount":10,"currencyCode":"CNY",
                 "paymentMethodCode":"CASH","description":"入院预交金"}
                """;
        jdbcTemplate.update("update RHN_SYS_ROLE_PERM_ASSIGN set DT_VALID_TO = current_timestamp - interval '1' day "
                + "where ID_TNT = ? and ID_ACC_PERM = 362387869896104", Long.valueOf(TENANT));
        try {
            mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/billing", episodeId).with(rhnWorkContext()))
                    .andExpect(status().isOk());
            mockMvc.perform(post("/api/inpatient/episodes/{episodeId}/billing/deposits", episodeId)
                            .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(depositBody))
                    .andExpect(status().isForbidden());
        } finally {
            jdbcTemplate.update("update RHN_SYS_ROLE_PERM_ASSIGN set DT_VALID_TO = null "
                    + "where ID_TNT = ? and ID_ACC_PERM = 362387869896104", Long.valueOf(TENANT));
        }
        JsonNode deposit = postJson("/api/inpatient/episodes/" + episodeId + "/billing/deposits",
                depositBody, 201);
        assertEquals(accountId, deposit.at("/account/patientAccountId").asString());
        assertEquals(false, deposit.get("duplicate").asBoolean());
        assertEquals(0, new BigDecimal("10").compareTo(deposit.at("/account/depositAmount").decimalValue()));
        assertEquals(0, new BigDecimal("28").compareTo(
                deposit.at("/account/estimatedOutstandingAmount").decimalValue()));
        assertEquals(0, new BigDecimal("8").compareTo(deposit.at("/account/ledgerBalance").decimalValue()));
        assertEquals(1, deposit.at("/account/deposits").size());
        assertEquals("IP-DEP-0001", deposit.at("/account/deposits/0/paymentNo").asString());
        assertEquals(0, new BigDecimal("10").compareTo(
                deposit.at("/account/deposits/0/originalAmount").decimalValue()));
        assertEquals(0, new BigDecimal("10").compareTo(
                deposit.at("/account/deposits/0/availableAmount").decimalValue()));

        JsonNode replay = postJson("/api/inpatient/episodes/" + episodeId + "/billing/deposits",
                depositBody, 201);
        assertEquals(true, replay.get("duplicate").asBoolean());
        assertEquals(deposit.get("paymentId").asString(), replay.get("paymentId").asString());
        assertEquals(1, count("select count(*) from RHN_BIL_PAT_ACCT where ID_PAT_ACCT = ? and SD_ACCT_TYPE = 'INPATIENT'",
                accountId));
        assertEquals(1, count("select count(*) from RHN_BIL_PAY where ID_PAT_ACCT = ? and ID_INVOICE is null "
                + "and CD_PAY_SCENE = 'INPATIENT_PREPAYMENT'", accountId));
        assertEquals(1, count("select count(*) from RHN_BIL_CHARGE_ITEM where ID_PAT_ACCT = ? "
                + "and SD_SRC_TYPE = 'INPATIENT_ORDER_TASK'", accountId));
        assertEquals(2, count("select count(*) from RHN_BIL_LEDGER_ENTRY where ID_PAT_ACCT = ?", accountId));
        assertEquals(0, count("select count(*) from RHN_BIL_STL where ID_PAT_ACCT = ?", accountId));

        prepareSignedDischargeRecord(RESIDENT, encounterId, "IP-BILLING");
        recordPrimaryDischargeDiagnosis(episodeId, 0, "J18.900", "肺炎", "IP-BILLING-DIAGNOSIS");
        postJson("/api/inpatient/episodes/" + episodeId + "/discharge", """
                {"expectedRevision":0,"dispositionCode":"HOME","note":"临床条件满足，财务后续处理",
                 "commandCode":"IP-BILLING-DISCHARGE"}
                """, 200);

        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/billing", episodeId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clinicalStatus").value("DISCHARGED"))
                .andExpect(jsonPath("$.paymentDue").value(true))
                .andExpect(jsonPath("$.financialWarningOnly").value(true))
                .andExpect(jsonPath("$.estimatedOutstandingAmount").value(28.0));

        JsonNode settlement = postJson("/api/inpatient/episodes/" + episodeId + "/billing/final-settlement", """
                {"invoiceNo":"IP-SETTLE-0001","currencyCode":"CNY","terminalCode":"WARD-CASHIER",
                 "commandCode":"IP-BILLING-FINAL"}
                """, 201);
        assertEquals("PARTIAL", settlement.get("status").asString());
        assertEquals(0, new BigDecimal("38").compareTo(settlement.get("netAmount").decimalValue()));
        assertEquals(0, new BigDecimal("10").compareTo(settlement.get("prepaymentAmount").decimalValue()));
        assertEquals(0, new BigDecimal("28").compareTo(settlement.get("outstandingAmount").decimalValue()));
        assertEquals("PENDING_PAYMENT", settlement.get("financialStatus").asString());
        assertEquals(0, settlement.get("refundableAmount").decimalValue().compareTo(BigDecimal.ZERO));
        assertEquals("OPEN", settlement.at("/account/accountStatus").asString());
        assertEquals(0, new BigDecimal("20").compareTo(
                settlement.at("/account/postedChargeAmount").decimalValue().subtract(new BigDecimal("18"))));
        assertEquals(0, settlement.at("/account/estimatedBedAmount").decimalValue().compareTo(BigDecimal.ZERO));
        assertEquals(0, settlement.at("/account/depositAmount").decimalValue().compareTo(BigDecimal.ZERO));
        assertEquals(0, new BigDecimal("10").compareTo(
                settlement.at("/account/deposits/0/allocatedAmount").decimalValue()));
        assertEquals(0, settlement.at("/account/deposits/0/availableAmount")
                .decimalValue().compareTo(BigDecimal.ZERO));

        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/billing/daily-statement", episodeId)
                        .param("businessDate", java.time.LocalDate.now().toString()).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.postedAmount").value(38.0))
                .andExpect(jsonPath("$.estimatedAmount").value(0.0))
                .andExpect(jsonPath("$.categorySummaries[?(@.category == 'BED')].postedAmount").value(20.0))
                .andExpect(jsonPath("$.categorySummaries[?(@.category == 'BED')].estimatedAmount").value(0.0))
                .andExpect(jsonPath("$.categorySummaries[?(@.category == 'BED')].amount").value(20.0));

        JsonNode replaySettlement = postJson(
                "/api/inpatient/episodes/" + episodeId + "/billing/final-settlement", """
                        {"invoiceNo":"IP-SETTLE-0001","currencyCode":"CNY","terminalCode":"WARD-CASHIER",
                         "commandCode":"IP-BILLING-FINAL"}
                        """, 201);
        assertEquals(true, replaySettlement.get("duplicate").asBoolean());
        assertEquals(1, count("select count(*) from RHN_VIS_INP_BED_DAY_FACT where ID_CARE_EPISODE = ?", episodeId));
        assertEquals(1, count("select count(*) from RHN_BIL_CHARGE_ITEM where ID_PAT_ACCT = ? "
                + "and SD_SRC_TYPE = 'INPATIENT_BED_DAY'", accountId));
        assertEquals(1, count("select count(*) from RHN_BIL_STL where ID_PAT_ACCT = ?", accountId));
        assertEquals(1, count("select count(*) from RHN_BIL_STL_TENDER where ID_STL = ? "
                + "and SD_TENDER_TYPE = 'PREPAYMENT'", settlement.get("settlementId").asString()));

        long settlementRevision = settlement.at("/account/financialSettlement/revision").asLong();
        mockMvc.perform(post("/api/inpatient/episodes/{episodeId}/billing/final-settlement/payments", episodeId)
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"commandCode":"IP-OVERPAY-0001",
                                 "paymentMethodCode":"CASH","amount":29,"currencyCode":"CNY"}
                                """.formatted(settlementRevision)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INPATIENT_PAYMENT_EXCEEDS_OUTSTANDING"));
        String paymentBody = """
                {"expectedRevision":%d,"commandCode":"IP-PAY-0001",
                 "paymentMethodCode":"CASH","amount":28,"currencyCode":"CNY"}
                """.formatted(settlementRevision);
        JsonNode payment = postJson("/api/inpatient/episodes/" + episodeId
                + "/billing/final-settlement/payments", paymentBody, 201);
        assertEquals(false, payment.get("duplicate").asBoolean());
        assertEquals("SETTLED", payment.at("/settlement/financialStatus").asString());
        assertEquals("CLOSED", payment.at("/account/accountStatus").asString());
        assertEquals(0, payment.at("/account/ledgerBalance").decimalValue().compareTo(BigDecimal.ZERO));
        JsonNode replayPayment = postJson("/api/inpatient/episodes/" + episodeId
                + "/billing/final-settlement/payments", paymentBody, 201);
        assertEquals(true, replayPayment.get("duplicate").asBoolean());
        assertEquals(1, count("select count(*) from RHN_BIL_PAY where ID_PAT_ACCT = ? "
                + "and ID_INVOICE is not null and CD_PAY_NO = 'IP-PAY-0001'", accountId));
    }

    @Test
    void excess_prepayment_becomes_refundable_and_refund_closes_the_financial_account() throws Exception {
        JsonNode admission = postJson("/api/inpatient/admissions", """
                {"residentId":"%s","bedId":"%s","admissionTypeCode":"GENERAL",
                 "admissionSourceCode":"DIRECT","admissionReason":"住院预交金退余测试",
                 "commandCode":"IP-REFUND-ADMIT"}
                """.formatted(RESIDENT, BED), 201);
        String episodeId = admission.get("id").asString();
        String encounterId = admission.get("encounterId").asString();
        JsonNode deposit = postJson("/api/inpatient/episodes/" + episodeId + "/billing/deposits", """
                {"paymentNo":"IP-REFUND-DEPOSIT","amount":50,"currencyCode":"CNY",
                 "paymentMethodCode":"CASH","description":"退余测试预交金"}
                """, 201);
        String accountId = deposit.at("/account/patientAccountId").asString();
        prepareSignedDischargeRecord(RESIDENT, encounterId, "IP-REFUND");
        recordPrimaryDischargeDiagnosis(episodeId, 0, "Z51.900", "住院观察", "IP-REFUND-DIAGNOSIS");
        postJson("/api/inpatient/episodes/" + episodeId + "/discharge", """
                {"expectedRevision":0,"dispositionCode":"HOME","note":"完成退余测试出院",
                 "commandCode":"IP-REFUND-DISCHARGE"}
                """, 200);
        JsonNode settlement = postJson("/api/inpatient/episodes/" + episodeId
                + "/billing/final-settlement", """
                {"invoiceNo":"IP-REFUND-SETTLE","currencyCode":"CNY","terminalCode":"WARD-CASHIER",
                 "commandCode":"IP-REFUND-FINAL"}
                """, 201);
        assertEquals("SETTLED", settlement.get("status").asString());
        assertEquals("PENDING_REFUND", settlement.get("financialStatus").asString());
        assertEquals(0, new BigDecimal("30").compareTo(settlement.get("refundableAmount").decimalValue()));
        assertEquals(0, new BigDecimal("30").compareTo(settlement.at("/account/depositAmount").decimalValue()));
        assertEquals("OPEN", settlement.at("/account/accountStatus").asString());

        long revision = settlement.at("/account/financialSettlement/revision").asLong();
        String refundBody = """
                {"expectedRevision":%d,"commandCode":"IP-REFUND-SURPLUS","amount":30,
                 "currencyCode":"CNY","reason":"退还住院预交金余额"}
                """.formatted(revision);
        JsonNode refund = postJson("/api/inpatient/episodes/" + episodeId
                + "/billing/final-settlement/refunds", refundBody, 201);
        assertEquals(false, refund.get("duplicate").asBoolean());
        assertEquals("SETTLED", refund.at("/settlement/financialStatus").asString());
        assertEquals("CLOSED", refund.at("/account/accountStatus").asString());
        assertEquals(0, refund.at("/account/depositAmount").decimalValue().compareTo(BigDecimal.ZERO));
        assertEquals(0, refund.at("/account/ledgerBalance").decimalValue().compareTo(BigDecimal.ZERO));
        assertEquals(1, count("select count(*) from RHN_BIL_PAY where ID_PAT_ACCT = ? "
                + "and SD_PAY_TYPE = 'REFUND' and CD_PAY_NO = 'IP-REFUND-SURPLUS'", accountId));
        assertEquals(1, count("select count(*) from RHN_BIL_PAY where ID_PAT_ACCT = ? "
                + "and SD_PAY_TYPE = 'REFUND' and ID_PAY_RVRS is not null", accountId));
        JsonNode replay = postJson("/api/inpatient/episodes/" + episodeId
                + "/billing/final-settlement/refunds", refundBody, 201);
        assertEquals(true, replay.get("duplicate").asBoolean());
    }

    @Test
    void zero_outstanding_settlement_is_finalized_by_exact_prepayment_without_supplementary_payment() throws Exception {
        JsonNode admission = postJson("/api/inpatient/admissions", """
                {"residentId":"%s","bedId":"%s","admissionTypeCode":"GENERAL",
                 "admissionSourceCode":"DIRECT","admissionReason":"零应付结算测试",
                 "commandCode":"IP-ZERO-ADMIT"}
                """.formatted(RESIDENT, BED), 201);
        String episodeId = admission.get("id").asString();
        String encounterId = admission.get("encounterId").asString();
        completeServiceOrder(episodeId);
        postJson("/api/inpatient/episodes/" + episodeId + "/billing/deposits", """
                {"paymentNo":"IP-ZERO-DEPOSIT","amount":38,"currencyCode":"CNY",
                 "paymentMethodCode":"CASH","description":"精确覆盖全部住院费用"}
                """, 201);
        prepareSignedDischargeRecord(RESIDENT, encounterId, "IP-ZERO");
        recordPrimaryDischargeDiagnosis(episodeId, 0, "Z00.000", "健康检查", "IP-ZERO-DIAGNOSIS");
        postJson("/api/inpatient/episodes/" + episodeId + "/discharge", """
                {"expectedRevision":0,"dispositionCode":"HOME","note":"零应付出院",
                 "commandCode":"IP-ZERO-DISCHARGE"}
                """, 200);
        JsonNode settlement = postJson("/api/inpatient/episodes/" + episodeId
                + "/billing/final-settlement", """
                {"invoiceNo":"IP-ZERO-SETTLE","currencyCode":"CNY","terminalCode":"WARD-CASHIER",
                 "commandCode":"IP-ZERO-FINAL"}
                """, 201);
        assertEquals(0, settlement.get("outstandingAmount").decimalValue().compareTo(BigDecimal.ZERO));
        assertEquals(0, settlement.get("refundableAmount").decimalValue().compareTo(BigDecimal.ZERO));
        assertEquals("SETTLED", settlement.get("status").asString());
        assertEquals("SETTLED", settlement.get("financialStatus").asString());
        assertEquals("CLOSED", settlement.at("/account/accountStatus").asString());
        assertEquals(1, count("select count(*) from RHN_BIL_PAY where ID_PAT_ACCT = ?",
                settlement.at("/account/patientAccountId").asString()));
        assertEquals(0, count("select count(*) from RHN_BIL_PAY where ID_PAT_ACCT = ? "
                        + "and CD_PAY_SCENE = 'CASHIER'",
                settlement.at("/account/patientAccountId").asString()));
        assertEquals(1, count("select count(*) from RHN_BIL_STL_EVT where ID_STL = ? "
                + "and SD_EVT_TYPE = 'FINALIZE'", settlement.get("settlementId").asString()));
    }

    private String completeServiceOrder(String episodeId) throws Exception {
        JsonNode order = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"SERVICE","durationType":"TEMPORARY",
                 "catalogItemId":"%s","instructions":"住院血细胞分析",
                 "commandCode":"IP-BILLING-ORDER"}
                """.formatted(episodeId, SERVICE_ITEM), 201);
        String requestId = order.get("id").asString();
        postJson("/api/inpatient/orders/" + requestId + "/sign",
                command(0, "IP-BILLING-ORDER-SIGN"), 200);
        postJson("/api/inpatient/orders/" + requestId + "/verify",
                command(1, "IP-BILLING-ORDER-VERIFY"), 200);
        JsonNode plan = postJson("/api/inpatient/orders/" + requestId + "/plans", """
                {"expectedRevision":2,"plannedTimes":["%s"],"commandCode":"IP-BILLING-ORDER-PLAN"}
                """.formatted(Instant.now().minusSeconds(60)), 200);
        String taskId = plan.at("/tasks/0/id").asString();
        postJson("/api/inpatient/order-tasks/" + taskId + "/execute", """
                {"expectedRevision":0,"outcomeCode":"COMPLETED","commandCode":"IP-BILLING-ORDER-EXECUTE"}
                """, 200);
        return taskId;
    }

    private void skipServiceOrder(String episodeId) throws Exception {
        JsonNode order = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"SERVICE","durationType":"TEMPORARY",
                 "catalogItemId":"%s","instructions":"患者拒绝的住院检查",
                 "commandCode":"IP-BILLING-SKIP-ORDER"}
                """.formatted(episodeId, SERVICE_ITEM), 201);
        String requestId = order.get("id").asString();
        postJson("/api/inpatient/orders/" + requestId + "/sign",
                command(0, "IP-BILLING-SKIP-SIGN"), 200);
        postJson("/api/inpatient/orders/" + requestId + "/verify",
                command(1, "IP-BILLING-SKIP-VERIFY"), 200);
        JsonNode plan = postJson("/api/inpatient/orders/" + requestId + "/plans", """
                {"expectedRevision":2,"plannedTimes":["%s"],"commandCode":"IP-BILLING-SKIP-PLAN"}
                """.formatted(Instant.now().minusSeconds(30)), 200);
        postJson("/api/inpatient/order-tasks/" + plan.at("/tasks/0/id").asString() + "/skip", """
                {"expectedRevision":0,"outcomeCode":"PATIENT_REFUSED",
                 "note":"患者拒绝本次检查","commandCode":"IP-BILLING-SKIP-TASK"}
                """, 200);
    }

    private JsonNode postJson(String path, String body, int expectedStatus) throws Exception {
        String response = mockMvc.perform(post(path).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expectedStatus)).andReturn().getResponse().getContentAsString();
        return json(response);
    }

    private static String command(long revision, String commandCode) {
        return "{\"expectedRevision\":" + revision + ",\"commandCode\":\"" + commandCode + "\"}";
    }

    private int count(String sql, String id) {
        return jdbcTemplate.queryForObject(sql, Integer.class, Long.valueOf(id));
    }

}
