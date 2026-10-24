package com.rhn;

import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 惠民减免与结算集成：医保前减免随账单落账，医保后减免在医保回执后自动执行或由收费员按自费确认。 */
@ResetDatabaseBeforeEachTestMethod
@Import(RegistrationBillingIntegrationTest.InsuranceCallbackTestController.class)
class BillingReliefSettlementTest extends RhnIntegrationTestSupport {
    private static final String DIRECT_VISIT_ENABLE = "362387869795122";
    private static final String DIRECT_VISIT_SERVICE = "362387869795123";
    @Autowired JdbcTemplate jdbc;
    private boolean directVisitConfigured;

    @Test
    void pre_insurance_free_relief_settles_a_self_pay_invoice_without_payment() throws Exception {
        createPolicy("SIGNED-FREE", "PRE_INSURANCE", "HOSPITAL", false,
                "{\"feeScope\":\"ALL\",\"method\":\"FREE\"}", "{\"source\":\"ALL\"}", "");
        Visit visit = visit();
        // 未声明自费时只执行允许医保患者享受的政策；本政策仅限自费，因此不减免。
        JsonNode undeclared = issueInvoice(visit, null, 201);
        assertThat(undeclared.get("discountAmount").decimalValue()).isZero();

        Visit second = visit();
        JsonNode invoice = issueInvoice(second, "SELF_PAY", 201);
        assertThat(invoice.get("netAmount").decimalValue()).isZero();
        assertThat(invoice.get("discountAmount").decimalValue()).isEqualByComparingTo(second.amount());
        JsonNode settlement = send(get("/api/billing/settlements/{id}", invoice.get("id").asString()), null, 200);
        assertThat(settlement.get("status").asString()).isEqualTo("SETTLED");
        assertThat(settlement.at("/lines/0/discountAmount").decimalValue()).isEqualByComparingTo(second.amount());
        JsonNode relief = send(get("/api/billing/settlements/{id}/relief", invoice.get("id").asString()), null, 200);
        assertThat(relief.at("/applications/0/timing").asString()).isEqualTo("PRE_INSURANCE");
        assertThat(relief.at("/applications/0/lines/0/reliefAmount").decimalValue()).isEqualByComparingTo(second.amount());
        assertThat(ledgerRelief(invoice.get("id").asLong())).isEqualByComparingTo(second.amount());
        assertThat(quotaTransactions(invoice.get("id").asLong(), "CONFIRM")).isEqualTo(1);
    }

    @Test
    void self_pay_only_pre_relief_blocks_a_later_insurance_settlement() throws Exception {
        createPolicy("STAFF-HALF", "PRE_INSURANCE", "HOSPITAL", false,
                "{\"feeScope\":\"ALL\",\"method\":\"RATIO\",\"ratio\":0.5}", "{\"source\":\"ALL\"}", "");
        Visit visit = visit();
        JsonNode invoice = issueInvoice(visit, "SELF_PAY", 201);
        assertThat(invoice.get("discountAmount").decimalValue()).isPositive();
        JsonNode blocked = send(post("/api/billing/settlements/{id}/insurance/pre-settlements", invoice.get("id").asString()),
                preSettleBody(visit, invoice, GlobalIds.next()), 409);
        assertThat(blocked.get("code").asString()).isEqualTo("RELIEF_SELF_PAY_ONLY");
    }

    @Test
    void self_pay_confirm_applies_roster_relief_with_once_cap_and_patient_pays_the_rest() throws Exception {
        createPolicy("CIVIL-AID", "POST_INSURANCE", "GOVERNMENT", true,
                "{\"feeScope\":\"ALL\",\"method\":\"RATIO\",\"ratio\":0.5}",
                "{\"source\":\"ROSTER\",\"qualificationType\":\"MINIMUM_LIVING\"}", ",\"onceMaxAmount\":1");
        Visit outsider = visit();
        JsonNode outsiderInvoice = issueInvoice(outsider, null, 201);
        JsonNode preview = send(get("/api/billing/settlements/{id}/relief", outsiderInvoice.get("id").asString()), null, 200);
        assertThat(preview.at("/pending/0/status").asString()).isEqualTo("SKIPPED");
        assertThat(preview.at("/pending/0/message").asString()).contains("最低生活保障对象");

        Visit member = visit();
        send(post("/api/billing/relief/roster"), """
                {"qualificationType":"MINIMUM_LIVING","residentId":"%s","effectiveFrom":"%s"}
                """.formatted(member.residentId(), LocalDate.now().minusDays(1)), 201);
        JsonNode invoice = issueInvoice(member, null, 201);
        String settlementId = invoice.get("id").asString();
        BigDecimal expected = member.amount().multiply(new BigDecimal("0.5")).setScale(2, RoundingMode.HALF_UP)
                .min(BigDecimal.ONE);
        JsonNode pending = send(get("/api/billing/settlements/{id}/relief", settlementId), null, 200);
        assertThat(pending.at("/pending/0/status").asString()).isEqualTo("APPLIED");
        assertThat(pending.at("/pending/0/reliefAmount").decimalValue()).isEqualByComparingTo(expected);
        assertThat(pending.get("applications")).isEmpty();

        JsonNode confirmed = send(post("/api/billing/settlements/{id}/relief/confirm", settlementId), "{}", 200);
        assertThat(confirmed.get("reliefAmount").decimalValue()).isEqualByComparingTo(expected);
        assertThat(confirmed.get("outstandingAmount").decimalValue())
                .isEqualByComparingTo(member.amount().subtract(expected));
        JsonNode settlement = send(get("/api/billing/settlements/{id}", settlementId), null, 200);
        assertThat(settlement.get("status").asString()).isEqualTo("PARTIAL");
        assertThat(settlement.at("/tenders/0/tenderType").asString()).isEqualTo("SUBSIDY");
        assertThat(settlement.get("patientAmount").decimalValue()).isEqualByComparingTo(member.amount().subtract(expected));
        // 重复确认不会再次减免。
        JsonNode again = send(post("/api/billing/settlements/{id}/relief/confirm", settlementId), "{}", 200);
        assertThat(again.get("reliefAmount").decimalValue()).isEqualByComparingTo(expected);
        assertThat(again.get("applications")).hasSize(1);

        send(post("/api/billing/invoices/{id}/payments", settlementId), """
                {"paymentNo":"PAY-%s","paymentMethodCode":"CASH","paymentSceneCode":"CASHIER","amount":%s}
                """.formatted(UUID.randomUUID(), member.amount().subtract(expected).toPlainString()), 201);
        assertThat(send(get("/api/billing/settlements/{id}", settlementId), null, 200).get("status").asString())
                .isEqualTo("SETTLED");
        assertThat(quotaTransactions(Long.valueOf(settlementId), "CONFIRM")).isEqualTo(1);
        assertThat(ledgerRelief(Long.valueOf(settlementId))).isEqualByComparingTo(expected);
        JsonNode blocked = send(post("/api/billing/settlements/{id}/relief/confirm", settlementId), "{}", 409);
        assertThat(blocked.get("code").asString()).isEqualTo("RELIEF_SETTLEMENT_STATE_INVALID");
    }

    @Test
    void cancelling_an_unpaid_settlement_returns_charges_to_pending_and_restores_pre_insurance_quota() throws Exception {
        createPolicy("STAFF-ONCE", "PRE_INSURANCE", "HOSPITAL", false,
                "{\"feeScope\":\"ALL\",\"method\":\"RATIO\",\"ratio\":0.5}", "{\"source\":\"ALL\"}",
                ",\"quotaPeriod\":\"YEAR\",\"periodMaxCount\":1");
        Visit visit = visit();
        JsonNode invoice = issueInvoice(visit, "SELF_PAY", 201);
        BigDecimal discount = invoice.get("discountAmount").decimalValue();
        assertThat(discount).isPositive();
        long invoiceId = invoice.get("id").asLong();
        assertThat(send(get("/api/billing/encounters/{id}/statement", visit.encounterId()), null, 200)
                .get("uninvoicedAmount").decimalValue()).isZero();

        JsonNode cancelled = send(post("/api/billing/settlements/{id}/cancel", invoice.get("id").asString()),
                "{\"reason\":\"收费员发现开错项目\"}", 200);
        assertThat(cancelled.get("chargeItemIds")).hasSize(1);
        JsonNode statement = send(get("/api/billing/encounters/{id}/statement", visit.encounterId()), null, 200);
        assertThat(statement.get("uninvoicedAmount").decimalValue()).isEqualByComparingTo(visit.amount());
        assertThat(statement.get("settlements")).isEmpty();
        assertThat(statement.get("invoices")).isEmpty();
        assertThat(statement.get("accountBalance").decimalValue()).isEqualByComparingTo(visit.amount());
        assertThat(ledgerRelief(invoiceId)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from RHN_BIL_RELIEF_APPLY where ID_STL = ?", Integer.class, invoiceId)).isZero();

        // 额度原样退回：同一周期仅限一次的政策再次开单仍然减免。
        JsonNode again = issueInvoice(visit, "SELF_PAY", 201);
        assertThat(again.get("discountAmount").decimalValue()).isEqualByComparingTo(discount);
        assertThat(jdbc.queryForObject("select QTY_USED from RHN_BIL_RELIEF_QUOTA where ID_PAT = ? and CD_SCOPE = 'POLICY'",
                Integer.class, Long.valueOf(visit.residentId()))).isEqualTo(1);
    }

    @Test
    void batch_cancellation_cancels_every_listed_unpaid_settlement_in_one_request() throws Exception {
        Visit first = visit();
        Visit second = visit();
        JsonNode firstInvoice = issueInvoice(first, "SELF_PAY", 201);
        JsonNode secondInvoice = issueInvoice(second, "SELF_PAY", 201);
        JsonNode cancelled = send(post("/api/billing/settlements/cancel"), """
                {"settlementIds":["%s","%s"],"reason":"诊毕页未收款，取消诊间结算单"}
                """.formatted(firstInvoice.get("id").asString(), secondInvoice.get("id").asString()), 200);
        assertThat(cancelled).hasSize(2);
        assertThat(send(get("/api/billing/encounters/{id}/statement", first.encounterId()), null, 200)
                .get("settlements")).isEmpty();
        assertThat(send(get("/api/billing/encounters/{id}/statement", second.encounterId()), null, 200)
                .get("uninvoicedAmount").decimalValue()).isEqualByComparingTo(second.amount());

        // 与逐单取消同语义：已取消的结算单不能再次取消，其余未取消的保持原状。
        JsonNode thirdInvoice = issueInvoice(visit(), "SELF_PAY", 201);
        assertThat(send(post("/api/billing/settlements/cancel"), """
                {"settlementIds":["%s","%s"],"reason":"诊毕页未收款，取消诊间结算单"}
                """.formatted(firstInvoice.get("id").asString(), thirdInvoice.get("id").asString()), 404)
                .get("code").asString()).isEqualTo("SETTLEMENT_NOT_FOUND");
        assertThat(send(get("/api/billing/settlements/{id}", thirdInvoice.get("id").asString()), null, 200)
                .get("status").asString()).isEqualTo("PRICED");
        assertThat(send(post("/api/billing/settlements/cancel"), "{\"settlementIds\":[],\"reason\":\"放弃收款\"}", 400)
                .get("code").asString()).isEqualTo("VALIDATION_FAILED");
    }

    @Test
    void a_settlement_with_payment_activity_or_unrevocable_insurance_cannot_be_cancelled() throws Exception {
        Visit visit = visit();
        long coverageId = GlobalIds.next();
        jdbc.update("insert into RHN_INS_PAT_COVER (ID_PAT_COVER, REVISION, ID_TNT, ID_PAT, CD_COVER_TYPE, NA_PAYER, "
                        + "CD_MEMBER_NO, FG_PRIMARY_FLAG, DA_VALID_FROM, SD_STATUS, DT_CREATED, ID_USER_CREATED, DT_UPDATED, "
                        + "ID_USER_UPDATED) values (?, 0, ?, ?, '01', '测试医保基金', 'MASKED', true, ?, 'ACTIVE', ?, 'test', ?, 'test')",
                coverageId, Long.valueOf(TENANT), Long.valueOf(visit.residentId()), LocalDate.now().minusDays(1),
                Instant.now(), Instant.now());
        JsonNode invoice = issueInvoice(visit, "MEDICAL_INSURANCE", 201);
        String settlementId = invoice.get("id").asString();
        send(post("/api/billing/settlements/{id}/insurance/pre-settlements", settlementId),
                preSettleBody(visit, invoice, coverageId).replace("\"BASIC\"", "\"310\""), 201);
        // 医保试算结果尚未回执：结果未知，不能取消。
        assertThat(send(post("/api/billing/settlements/{id}/cancel", settlementId), "{\"reason\":\"放弃结算\"}", 409)
                .get("code").asString()).isEqualTo("SETTLEMENT_NOT_CANCELLABLE");
        String settlementNo = send(get("/api/billing/settlements/{id}", settlementId), null, 200).get("settlementNo").asString();
        send(post("/api/test/insurance-callback"), """
                {"regionCode":"TEST_REGION","externalMessageBusinessId":"CB-%1$s","commandCode":"CB-CMD-%1$s",
                 "settlementNo":"%2$s","operation":"PRE_SETTLE","externalSettlementNo":"EXT-%1$s","status":"SUCCEEDED",
                 "insuranceFundAmount":%3$s,"personalAccountAmount":0,"patientCashAmount":0,"otherFundAmount":0,
                 "currencyCode":"CNY","sanitizedPayload":{"verified":true}}
                """.formatted(UUID.randomUUID(), settlementNo, visit.amount().toPlainString()), 200);
        // 已试算但该医保接口不支持撤销试算：保持结算单不变，避免医保平台残留费用明细。
        assertThat(send(post("/api/billing/settlements/{id}/cancel", settlementId), "{\"reason\":\"放弃结算\"}", 409)
                .get("code").asString()).isEqualTo("INSURANCE_ADAPTER_UNAVAILABLE");
        assertThat(send(get("/api/billing/settlements/{id}", settlementId), null, 200).get("status").asString())
                .isEqualTo("PRICED");
        assertThat(send(post("/api/billing/encounters/{id}/unpaid-settlements/cancel", visit.encounterId()),
                "{\"reason\":\"医生修改医嘱\"}", 409).get("code").asString()).isEqualTo("INSURANCE_ADAPTER_UNAVAILABLE");

        Visit paid = visit();
        JsonNode paidInvoice = issueInvoice(paid, "SELF_PAY", 201);
        send(post("/api/billing/invoices/{id}/payments", paidInvoice.get("id").asString()), """
                {"paymentNo":"PAY-%s","paymentMethodCode":"CASH","paymentSceneCode":"CASHIER","amount":%s}
                """.formatted(UUID.randomUUID(), paid.amount().toPlainString()), 201);
        assertThat(send(post("/api/billing/settlements/{id}/cancel", paidInvoice.get("id").asString()),
                "{\"reason\":\"放弃结算\"}", 409).get("code").asString()).isEqualTo("SETTLEMENT_NOT_CANCELLABLE");
        assertThat(send(post("/api/billing/encounters/{id}/unpaid-settlements/cancel", paid.encounterId()),
                "{\"reason\":\"医生修改医嘱\"}", 200)).isEmpty();
    }

    @Test
    void period_count_quota_stops_relief_after_it_is_used() throws Exception {
        createPolicy("ANNUAL-ONCE", "POST_INSURANCE", "HOSPITAL", true,
                "{\"feeScope\":\"ALL\",\"method\":\"FREE\"}", "{\"source\":\"ALL\"}",
                ",\"quotaPeriod\":\"YEAR\",\"periodMaxCount\":1");
        Visit first = visit();
        JsonNode firstInvoice = issueInvoice(first, null, 201);
        JsonNode confirmed = send(post("/api/billing/settlements/{id}/relief/confirm", firstInvoice.get("id").asString()), "{}", 200);
        assertThat(confirmed.get("reliefAmount").decimalValue()).isEqualByComparingTo(first.amount());
        assertThat(send(get("/api/billing/settlements/{id}", firstInvoice.get("id").asString()), null, 200)
                .get("status").asString()).isEqualTo("SETTLED");
        assertThat(firstInvoice.get("id").asString()).isNotBlank();
        JsonNode tender = send(get("/api/billing/settlements/{id}", firstInvoice.get("id").asString()), null, 200).at("/tenders/0");
        assertThat(tender.get("tenderType").asString()).isEqualTo("HOSPITAL_DISCOUNT");

        jdbc.update("update RHN_VIS_ENC set DT_REGD = ? where ID_ENC = ?",
                java.sql.Timestamp.from(Instant.now().minus(10, ChronoUnit.DAYS)), Long.valueOf(first.encounterId()));
        Visit again = visit(first.residentId());
        assertThat(again.encounterId()).isNotEqualTo(first.encounterId());
        JsonNode secondInvoice = issueInvoice(again, null, 201);
        JsonNode preview = send(get("/api/billing/settlements/{id}/relief", secondInvoice.get("id").asString()), null, 200);
        assertThat(preview.at("/pending/0/message").asString()).isEqualTo("本周期享受次数已用完");
    }

    @Test
    void insurance_settlement_applies_post_relief_automatically_and_manual_relief_needs_a_reason() throws Exception {
        createPolicy("ELDER-SUBSIDY", "POST_INSURANCE", "GOVERNMENT", true,
                "{\"feeScope\":\"ALL\",\"method\":\"RATIO\",\"ratio\":0.5}", "{\"source\":\"ALL\"}", "");
        JsonNode manualPolicy = createPolicy("HARDSHIP", "POST_INSURANCE", "HOSPITAL", true,
                "{\"feeScope\":\"ALL\",\"method\":\"MANUAL\"}", "{\"source\":\"ALL\"}", ",\"priority\":200");
        Visit visit = visit();
        long coverageId = GlobalIds.next();
        jdbc.update("insert into RHN_INS_PAT_COVER (ID_PAT_COVER, REVISION, ID_TNT, ID_PAT, CD_COVER_TYPE, NA_PAYER, "
                        + "CD_MEMBER_NO, FG_PRIMARY_FLAG, DA_VALID_FROM, SD_STATUS, DT_CREATED, ID_USER_CREATED, DT_UPDATED, "
                        + "ID_USER_UPDATED) values (?, 0, ?, ?, 'BASIC', '测试医保基金', 'MASKED', true, ?, 'ACTIVE', ?, 'test', ?, 'test')",
                coverageId, Long.valueOf(TENANT), Long.valueOf(visit.residentId()), LocalDate.now().minusDays(1),
                Instant.now(), Instant.now());
        jdbc.update("update RHN_SYS_ORG set CD_TZ = ? where ID_ORG = ?", "Asia/Shanghai", Long.valueOf(ORGANIZATION));
        JsonNode invoice = issueInvoice(visit, "MEDICAL_INSURANCE", 201);
        String settlementId = invoice.get("id").asString();
        JsonNode claim = send(post("/api/billing/settlements/{id}/insurance/pre-settlements", settlementId),
                preSettleBody(visit, invoice, coverageId), 201);
        // 医保尚未正式结算时不能按自费确认。
        assertThat(send(post("/api/billing/settlements/{id}/relief/confirm", settlementId), "{}", 409)
                .get("code").asString()).isEqualTo("RELIEF_INSURANCE_PENDING");
        BigDecimal net = visit.amount();
        BigDecimal fund = net.multiply(new BigDecimal("0.6")).setScale(2, RoundingMode.DOWN);
        BigDecimal cash = net.subtract(fund);
        String settlementNo = send(get("/api/billing/settlements/{id}", settlementId), null, 200).get("settlementNo").asString();
        String callback = """
                {"regionCode":"TEST_REGION","externalMessageBusinessId":"CB-%1$s","commandCode":"CB-CMD-%1$s",
                 "settlementNo":"%2$s","operation":"%5$s","externalSettlementNo":"EXT-%1$s","status":"SUCCEEDED",
                 "insuranceFundAmount":%3$s,"personalAccountAmount":0,"patientCashAmount":%4$s,"otherFundAmount":0,
                 "currencyCode":"CNY","sanitizedPayload":{"verified":true}}
                """;
        send(post("/api/test/insurance-callback"), callback.formatted(UUID.randomUUID(), settlementNo,
                fund.toPlainString(), cash.toPlainString(), "PRE_SETTLE"), 200);
        send(post("/api/billing/insurance-claims/{id}/settle", claim.get("claimId").asString()),
                "{\"commandCode\":\"SET-%s\"}".formatted(UUID.randomUUID()), 200);
        send(post("/api/test/insurance-callback"), callback.formatted(UUID.randomUUID(), settlementNo,
                fund.toPlainString(), cash.toPlainString(), "SETTLE"), 200);

        BigDecimal automatic = cash.multiply(new BigDecimal("0.5")).setScale(2, RoundingMode.HALF_UP);
        JsonNode relief = send(get("/api/billing/settlements/{id}/relief", settlementId), null, 200);
        assertThat(relief.get("reliefAmount").decimalValue()).isEqualByComparingTo(automatic);
        assertThat(relief.at("/applications/0/sponsor").asString()).isEqualTo("GOVERNMENT");
        JsonNode awaiting = null;
        for (JsonNode item : relief.get("pending")) {
            if (item.get("policyId").asString().equals(manualPolicy.get("id").asString())) awaiting = item;
        }
        assertThat(awaiting).isNotNull();
        assertThat(awaiting.get("status").asString()).isEqualTo("AWAITING_MANUAL");
        BigDecimal remaining = cash.subtract(automatic);
        assertThat(awaiting.get("manualMaxAmount").decimalValue()).isEqualByComparingTo(remaining);

        String manualBody = """
                {"manual":[{"policyId":"%s","amount":%s%s}]}
                """;
        send(post("/api/billing/settlements/{id}/relief/confirm", settlementId),
                manualBody.formatted(manualPolicy.get("id").asString(), remaining.toPlainString(), ""), 400);
        JsonNode manual = send(post("/api/billing/settlements/{id}/relief/confirm", settlementId),
                manualBody.formatted(manualPolicy.get("id").asString(), remaining.toPlainString(),
                        ",\"reason\":\"院长特批困难救助\",\"evidence\":\"审批单 2026-018\""), 200);
        assertThat(manual.get("applications")).hasSize(2);
        assertThat(manual.at("/applications/1/manualReason").asString()).isEqualTo("院长特批困难救助");
        assertThat(manual.get("outstandingAmount").decimalValue()).isZero();
        assertThat(send(get("/api/billing/settlements/{id}", settlementId), null, 200).get("status").asString())
                .isEqualTo("SETTLED");
    }

    @Test
    void cashier_decides_manual_relief_within_the_approval_threshold_and_records_are_queryable() throws Exception {
        JsonNode policy = createPolicy("CASHIER-HARDSHIP", "POST_INSURANCE", "GOVERNMENT", true,
                "{\"feeScope\":\"ALL\",\"method\":\"MANUAL\",\"manualMaxAmount\":5}", "{\"source\":\"ALL\"}",
                ",\"payerCode\":\"MZJ\",\"payerName\":\"县民政局\",\"manualApprovalAmount\":1");
        assertThat(policy.at("/current/manualApprovalAmount").decimalValue()).isEqualByComparingTo("1");
        // 核定审批阈值只对含人工核定规则的政策有意义。
        JsonNode invalid = send(post("/api/billing/relief/policies"), """
                {"code":"BAD-THRESHOLD","name":"BAD","draft":{"timing":"POST_INSURANCE","sponsor":"HOSPITAL",
                 "scope":{"scenes":["OUTPATIENT"]},"effectiveFrom":"%s","manualApprovalAmount":1,
                 "rules":[{"feeScope":"ALL","method":"FREE"}],"qualifications":[{"source":"ALL"}]}}
                """.formatted(LocalDate.now()), 400);
        assertThat(invalid.get("code").asString()).isEqualTo("RELIEF_MANUAL_APPROVAL_UNUSED");
        // 收费员只有核定权限、没有审批权限。
        jdbc.update("delete from RHN_SYS_ROLE_PERM_ASSIGN where ID_ROLE_PERM_ASSIGN = 362387869940323");

        Visit visit = visit();
        String settlementId = issueInvoice(visit, "SELF_PAY", 201).get("id").asString();
        JsonNode preview = send(get("/api/billing/settlements/{id}/relief", settlementId), null, 200);
        assertThat(preview.at("/pending/0/status").asString()).isEqualTo("AWAITING_MANUAL");
        assertThat(preview.at("/pending/0/manualMaxAmount").decimalValue())
                .isEqualByComparingTo(visit.amount().min(new BigDecimal("5")));
        assertThat(preview.at("/pending/0/manualApprovalAmount").decimalValue()).isEqualByComparingTo("1");

        String body = """
                {"manual":[{"policyId":"%s","amount":%s,"reason":"家庭困难，收费员核定","evidence":"村委会证明 018"}]}
                """;
        JsonNode overThreshold = send(post("/api/billing/settlements/{id}/relief/confirm", settlementId),
                body.formatted(policy.get("id").asString(), "2"), 403);
        assertThat(overThreshold.get("code").asString()).isEqualTo("RELIEF_MANUAL_APPROVAL_REQUIRED");
        JsonNode decided = send(post("/api/billing/settlements/{id}/relief/confirm", settlementId),
                body.formatted(policy.get("id").asString(), "1"), 200);
        assertThat(decided.get("reliefAmount").decimalValue()).isEqualByComparingTo("1");

        // 对账查询：人工核定的减免记录带出患者、承担方、核定原因与依据，汇总按政策与承担方。
        String today = LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).toString();
        JsonNode records = send(get("/api/billing/relief/records").param("from", today).param("to", today)
                .param("manualOnly", "true"), null, 200);
        assertThat(records.get("total").asLong()).isEqualTo(1);
        JsonNode row = records.at("/items/0");
        assertThat(row.get("residentName").asString()).isEqualTo("惠民测试患者");
        assertThat(row.get("payerName").asString()).isEqualTo("县民政局");
        assertThat(row.get("reliefAmount").decimalValue()).isEqualByComparingTo("1");
        assertThat(row.get("manualReason").asString()).isEqualTo("家庭困难，收费员核定");
        assertThat(row.get("manualEvidence").asString()).isEqualTo("村委会证明 018");
        assertThat(row.get("qualificationText").asString()).isEqualTo("全部患者");
        assertThat(records.at("/summary/0/policyCode").asString()).isEqualTo("CASHIER-HARDSHIP");
        assertThat(records.at("/summary/0/patientCount").asLong()).isEqualTo(1);
        assertThat(records.get("netAmount").decimalValue()).isEqualByComparingTo("1");
        // 收款前的结算不计入“仅已完成结算”的对账口径；关键字按患者、结算号或政策匹配。
        JsonNode settled = send(get("/api/billing/relief/records").param("from", today).param("to", today)
                .param("settledOnly", "true"), null, 200);
        assertThat(settled.get("total").asLong()).isZero();
        JsonNode keyword = send(get("/api/billing/relief/records").param("from", today).param("to", today)
                .param("keyword", "民政局"), null, 200);
        assertThat(keyword.get("total").asLong()).isEqualTo(1);
    }

    /** 在途支付期间不能确认减免；取消在途支付后可确认，随后收款不能超过扣除减免后的实际应付。 */
    @Test
    void relief_is_blocked_by_an_in_flight_payment_and_later_collection_cannot_exceed_net_of_relief() throws Exception {
        createPolicy("GATE-RELIEF", "POST_INSURANCE", "HOSPITAL", true,
                "{\"feeScope\":\"ALL\",\"method\":\"RATIO\",\"ratio\":0.5}", "{\"source\":\"ALL\"}", ",\"onceMaxAmount\":1");
        Visit visit = visit();
        String settlementId = issueInvoice(visit, null, 201).get("id").asString();
        JsonNode order = send(post("/api/billing/settlements/{id}/payment-orders", settlementId), """
                {"idempotencyKey":"GATE-%s","businessScene":"OUTPATIENT","paymentSceneCode":"CASHIER",
                 "paymentMethodCode":"BANK_CARD","amount":%s,"terminalCode":"CASHIER-WEB"}
                """.formatted(UUID.randomUUID(), visit.amount().toPlainString()), 201);
        assertThat(order.get("status").asString()).isEqualTo("PENDING");
        assertThat(send(post("/api/billing/settlements/{id}/relief/confirm", settlementId), "{}", 409)
                .get("code").asString()).isEqualTo("RELIEF_PAYMENT_IN_FLIGHT");
        assertThat(send(get("/api/billing/settlements/{id}", settlementId), null, 200).get("reliefAmount").decimalValue()).isZero();

        send(post("/api/billing/payment-orders/{id}/cancel", order.get("id").asString()), null, 200);
        BigDecimal relief = send(post("/api/billing/settlements/{id}/relief/confirm", settlementId), "{}", 200)
                .get("reliefAmount").decimalValue();
        assertThat(relief).isPositive();

        String full = """
                {"paymentNo":"PAY-%s","paymentMethodCode":"CASH","paymentSceneCode":"CASHIER","amount":%s}
                """;
        assertThat(send(post("/api/billing/invoices/{id}/payments", settlementId),
                full.formatted(UUID.randomUUID(), visit.amount().toPlainString()), 409)
                .get("code").asString()).isEqualTo("PAYMENT_EXCEEDS_OUTSTANDING");
        send(post("/api/billing/invoices/{id}/payments", settlementId),
                full.formatted(UUID.randomUUID(), visit.amount().subtract(relief).toPlainString()), 201);
        assertThat(send(get("/api/billing/settlements/{id}", settlementId), null, 200).get("status").asString())
                .isEqualTo("SETTLED");
    }

    /** 已有现金入账后确认减免，若资金合计会超过净额则整体拒绝并回滚，不留下减免记录。 */
    @Test
    void relief_that_would_push_funds_above_the_net_amount_is_rejected_and_rolled_back() throws Exception {
        createPolicy("GATE-OVER", "POST_INSURANCE", "HOSPITAL", true,
                "{\"feeScope\":\"ALL\",\"method\":\"RATIO\",\"ratio\":0.5}", "{\"source\":\"ALL\"}", ",\"onceMaxAmount\":1");
        Visit visit = visit();
        String settlementId = issueInvoice(visit, null, 201).get("id").asString();
        BigDecimal cash = visit.amount().subtract(new BigDecimal("0.5"));
        send(post("/api/billing/invoices/{id}/payments", settlementId), """
                {"paymentNo":"PAY-%s","paymentMethodCode":"CASH","paymentSceneCode":"CASHIER","amount":%s}
                """.formatted(UUID.randomUUID(), cash.toPlainString()), 201);
        assertThat(send(post("/api/billing/settlements/{id}/relief/confirm", settlementId), "{}", 409)
                .get("code").asString()).isEqualTo("SETTLEMENT_TENDER_EXCEEDS_NET");
        JsonNode settlement = send(get("/api/billing/settlements/{id}", settlementId), null, 200);
        assertThat(settlement.get("status").asString()).isEqualTo("PARTIAL");
        assertThat(settlement.get("reliefAmount").decimalValue()).isZero();
        assertThat(ledgerRelief(Long.parseLong(settlementId))).isZero();
        send(post("/api/billing/invoices/{id}/payments", settlementId), """
                {"paymentNo":"PAY-%s","paymentMethodCode":"CASH","paymentSceneCode":"CASHIER","amount":0.5}
                """.formatted(UUID.randomUUID()), 201);
        assertThat(send(get("/api/billing/settlements/{id}", settlementId), null, 200).get("status").asString())
                .isEqualTo("SETTLED");
    }

    private JsonNode createPolicy(String code, String timing, String sponsor, boolean insured, String rule,
                                  String qualification, String extra) throws Exception {
        JsonNode created = send(post("/api/billing/relief/policies"), """
                {"code":"%s","name":"%s","draft":{"timing":"%s","sponsor":"%s","scope":{"scenes":["OUTPATIENT"]},
                 "effectiveFrom":"%s","insuredApplicable":%s,"rules":[%s],"qualifications":[%s]%s}}
                """.formatted(code, code, timing, sponsor, LocalDate.now().minusDays(30), insured, rule, qualification, extra), 201);
        return send(post("/api/billing/relief/policies/{id}/publish", created.get("id").asString()),
                "{\"expectedRevision\":" + created.get("revision").asLong() + "}", 200);
    }

    private Visit visit() throws Exception {
        String resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("fullName", "惠民测试患者", "gender", "2",
                                "birthDate", "1950-03-04", "identifiers", java.util.List.of(Map.of("system", "9",
                                        "value", "RL" + UUID.randomUUID(), "useType", "SECONDARY"))))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        return visit(resident);
    }

    private Visit visit(String resident) throws Exception {
        if (!directVisitConfigured) {
            configure(DIRECT_VISIT_ENABLE, "true");
            configure(DIRECT_VISIT_SERVICE, "\"362387869795104\"");
            directVisitConfigured = true;
        }
        JsonNode received = send(post("/api/encounters/direct-visit"), objectMapper.writeValueAsString(Map.of(
                "residentId", resident, "commandCode", UUID.randomUUID().toString(),
                "factorResults", Map.of("NAME", true, "BIRTH_DATE", true), "terminalCode", "TEST")), 200);
        String encounterId = received.at("/encounter/id").asString();
        JsonNode statement = send(get("/api/billing/encounters/{id}/statement", encounterId), null, 200);
        return new Visit(resident, encounterId, statement.get("accountId").asString(),
                statement.get("uninvoicedAmount").decimalValue());
    }

    private JsonNode issueInvoice(Visit visit, String mode, int expected) throws Exception {
        String modeField = mode == null ? "" : ",\"settlementMode\":\"" + mode + "\"";
        return send(post("/api/billing/accounts/{id}/invoices", visit.accountId()), """
                {"invoiceNo":"INV-%s","settlementScene":"OUTPATIENT","terminalScene":"CASHIER"%s}
                """.formatted(UUID.randomUUID(), modeField), expected);
    }

    private String preSettleBody(Visit visit, JsonNode invoice, long coverageId) throws Exception {
        JsonNode settlement = send(get("/api/billing/settlements/{id}", invoice.get("id").asString()), null, 200);
        return """
                {"coverageId":"%s","idempotencyKey":"PRE-%s","regionCode":"TEST_REGION","insuranceTypeCode":"BASIC",
                 "organizationCode":"HOSP-001","departmentCode":"DEPT-001","practitionerCode":"DOC-001",
                 "diagnosisPayloadDigest":"SHA256-%s","serviceStartedAt":"%s",
                 "lines":[{"settlementLineId":"%s","insuranceItemCode":"INS-SVC-001"}]}
                """.formatted(coverageId, UUID.randomUUID(), visit.encounterId(),
                Instant.now().truncatedTo(ChronoUnit.SECONDS), settlement.at("/lines/0/id").asString());
    }

    private void configure(String id, String value) throws Exception {
        send(put("/api/platform/configuration/definitions/{id}/values", id), objectMapper.writeValueAsString(Map.of(
                "scopeType", "DEPARTMENT", "scopeId", DEPARTMENT, "organizationId", ORGANIZATION, "valueMode", "OVERRIDE",
                "valueJson", value, "reason", "惠民减免测试", "requestCode", UUID.randomUUID().toString())), 200);
    }

    private BigDecimal ledgerRelief(long invoiceId) {
        return jdbc.queryForObject("select coalesce(sum(AMT_ENTRY), 0) from RHN_BIL_LEDGER_ENTRY where ID_INVOICE = ? "
                + "and SD_ENTRY_TYPE = 'RELIEF' and SD_DIR = 'CREDIT'", BigDecimal.class, invoiceId);
    }

    private int quotaTransactions(long settlementId, String type) {
        return jdbc.queryForObject("select count(*) from RHN_BIL_RELIEF_QUOTA_TXN t join RHN_BIL_RELIEF_APPLY a "
                + "on a.ID_RELIEF_APPLY = t.ID_RELIEF_APPLY where a.ID_STL = ? and t.SD_TXN_TYPE = ?", Integer.class,
                settlementId, type);
    }

    private JsonNode send(MockHttpServletRequestBuilder request, String body, int expected) throws Exception {
        if (body != null) request.contentType(MediaType.APPLICATION_JSON).content(body);
        String result = mockMvc.perform(request.with(rhnWorkContext())).andExpect(status().is(expected))
                .andReturn().getResponse().getContentAsString();
        return result.isBlank() ? null : objectMapper.readTree(result);
    }

    private record Visit(String residentId, String encounterId, String accountId, BigDecimal amount) {}
}
