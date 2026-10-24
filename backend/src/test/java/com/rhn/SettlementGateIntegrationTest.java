package com.rhn;

import com.rhn.billing.application.SettlementFinalizationGuard;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.Invoice;
import com.rhn.billing.domain.LedgerEntry;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.Payment;
import com.rhn.billing.domain.PaymentOrder;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.domain.SettlementStatus;
import com.rhn.billing.domain.SettlementTender;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.InvoiceLineRepository;
import com.rhn.billing.infrastructure.InvoiceRepository;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.PaymentOrderRepository;
import com.rhn.billing.infrastructure.PaymentRepository;
import com.rhn.billing.infrastructure.SettlementLineRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.billing.infrastructure.SettlementTenderRepository;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 结算门禁：舍入随支付失败回退、超收拦截、结清平衡校验（账本借贷与资金合计）。 */
@org.springframework.context.annotation.Import(PaymentCallbackIntegrationTest.CallbackController.class)
class SettlementGateIntegrationTest extends RhnIntegrationTestSupport {
    private static final long USER = 362387869790222L;

    @Autowired ChargeItemRepository charges;
    @Autowired InvoiceLineRepository invoiceLines;
    @Autowired SettlementLineRepository settlementLines;
    @Autowired SettlementTenderRepository tenders;
    @Autowired PatientAccountRepository accounts;
    @Autowired InvoiceRepository invoices;
    @Autowired SettlementRepository settlements;
    @Autowired LedgerEntryRepository ledger;
    @Autowired PaymentRepository payments;
    @Autowired PaymentOrderRepository orders;
    @Autowired SettlementFinalizationGuard guard;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    private record Fixture(Invoice invoice, ChargeItem charge) {
        Long accountId() { return invoice.patientAccountId(); }
        Long id() { return invoice.id(); }
    }

    // ---------------------------------------------------------------- 1. 舍入随支付失败回退

    /** 银行卡 0.01 精度：33.675 -> 33.68，待支付订单取消后舍入归零；改用现金按原额全付，不再抹零，账户余额为 0。 */
    @Test
    void cancelled_rounded_order_gives_back_the_rounding_and_full_cash_payment_settles_without_it() throws Exception {
        Fixture fixture = fixture("33.675");
        JsonNode order = json(createOrder(fixture, "BANK_CARD", "33.68", "0.005").andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING")).andReturn().getResponse().getContentAsString());
        assertRounded(fixture, "0.005", "33.68");

        cancel(order.get("id").asLong()).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        assertRounded(fixture, "0", "33.675");
        assertThat(settlements.findById(fixture.id()).orElseThrow().status()).isNotEqualTo(SettlementStatus.SETTLED);
        // 终态迁移重放：幂等，不出错也不再变动。
        cancel(order.get("id").asLong()).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        assertRounded(fixture, "0", "33.675");

        pay(fixture, false, "CASH", "33.675", null).andExpect(status().isCreated());
        assertThat(settlements.findById(fixture.id()).orElseThrow().status()).isEqualTo(SettlementStatus.SETTLED);
        assertThat(entries(fixture, "ROUNDING")).isEmpty();
        assertThat(balance(fixture)).isEqualByComparingTo("0");
    }

    /** 支付通道回调失败与取消同一终态迁移入口：舍入同样回退。 */
    @Test
    void failed_callback_gives_back_the_rounding() throws Exception {
        Fixture fixture = fixture("33.675");
        JsonNode order = json(createOrder(fixture, "BANK_CARD", "33.68", "0.005").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        String body = """
                {"paymentMethodCode":"BANK_CARD","externalMessageBusinessId":"FAIL-%1$s","commandCode":"FAIL-CMD-%1$s",
                 "paymentOrderNo":"%2$s","status":"FAILED","currencyCode":"CNY","errorCode":"DECLINED","errorMessage":"银行拒绝",
                 "sanitizedPayload":{}}
                """.formatted(UUID.randomUUID(), order.get("orderNo").asString());
        mockMvc.perform(post("/api/test/payment-callback").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(body)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("FAILED"));
        assertRounded(fixture, "0", "33.675");
    }

    /** 同一凭证仍有其它在途支付指令时不回退舍入（它们可能基于该舍入创建）。 */
    @Test
    void rounding_is_kept_while_another_payment_is_still_in_flight() throws Exception {
        Fixture fixture = fixture("33.675");
        JsonNode order = json(createOrder(fixture, "BANK_CARD", "33.68", "0.005").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        orders.saveAndFlush(new PaymentOrder(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT),
                fixture.accountId(), fixture.id(), null, "PO-" + UUID.randomUUID(), "KEY-" + UUID.randomUUID(),
                "OUTPATIENT", "CASHIER", "BANK_CARD", "银行卡", "SETTLEMENT_PAY", new BigDecimal("10"), "CNY",
                "test", "TEST", null, USER));
        cancel(order.get("id").asLong()).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        assertRounded(fixture, "0.005", "33.68");
    }

    /** 舍入支付单成功：舍入保留并入账，账户余额为 0。 */
    @Test
    void succeeded_rounded_order_keeps_the_rounding_and_balance_is_zero() throws Exception {
        Fixture fixture = fixture("33.67");
        createOrder(fixture, "CASH", "33.6", "-0.07").andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("SUCCEEDED"));
        assertRounded(fixture, "-0.07", "33.60");
        assertThat(settlements.findById(fixture.id()).orElseThrow().status()).isEqualTo(SettlementStatus.SETTLED);
        assertThat(entries(fixture, "ROUNDING")).hasSize(1);
        assertThat(balance(fixture)).isEqualByComparingTo("0");
    }

    // ---------------------------------------------------------------- 2. 超收门禁

    /** 医保基金已出资 60：现金只能再收 40，超出的 50 在收款入口即被拒绝。 */
    @Test
    void cash_collection_cannot_exceed_what_the_patient_actually_owes() throws Exception {
        Fixture fixture = fixture("100");
        fundByInsurance(fixture, "60");
        pay(fixture, false, "CASH", "50", null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PAYMENT_EXCEEDS_OUTSTANDING"));
        createOrder(fixture, "CASH", "50", null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PAYMENT_ORDER_EXCEEDS_AVAILABLE"));
        assertThat(payments.netPaidForInvoice(Long.valueOf(TENANT), fixture.id())).isZero();
        assertThat(settlements.findById(fixture.id()).orElseThrow().status()).isNotEqualTo(SettlementStatus.SETTLED);

        pay(fixture, false, "CASH", "40", null).andExpect(status().isCreated());
        assertThat(settlements.findById(fixture.id()).orElseThrow().status()).isEqualTo(SettlementStatus.SETTLED);
        assertThat(balance(fixture)).isEqualByComparingTo("0");
    }

    // ---------------------------------------------------------------- 3. 结清平衡校验

    /** 缺少收费借方分录：结清事务整体回滚，结算单保持未结清，没有支付流水与账务残留。 */
    @Test
    void finalization_with_a_missing_charge_debit_is_rejected_and_rolled_back() throws Exception {
        Fixture fixture = fixture("33.60");
        jdbc.update("delete from RHN_BIL_LEDGER_ENTRY where ID_CHARGE_ITEM = ?", fixture.charge().id());
        pay(fixture, false, "CASH", "33.6", null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SETTLEMENT_LEDGER_IMBALANCE"));
        Settlement value = settlements.findById(fixture.id()).orElseThrow();
        assertThat(value.status()).isNotEqualTo(SettlementStatus.SETTLED);
        assertThat(payments.netPaidForInvoice(Long.valueOf(TENANT), fixture.id())).isZero();
        assertThat(ledger.creditNetForInvoice(Long.valueOf(TENANT), fixture.id())).isZero();
    }

    @Test
    void guard_accepts_a_balanced_settlement_and_rejects_unfunded_or_unbalanced_ones() throws Exception {
        Fixture fixture = fixture("33.60");
        Settlement unpaid = settlements.findById(fixture.id()).orElseThrow();
        // 资金合计 0 != 净额 33.60。
        assertThatThrownBy(() -> inTransaction(() -> { guard.requireBalanced(context(), unpaid); return null; }))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.code()).isEqualTo("SETTLEMENT_LEDGER_IMBALANCE"));

        pay(fixture, false, "CASH", "33.6", null).andExpect(status().isCreated());
        Settlement settled = settlements.findById(fixture.id()).orElseThrow();
        inTransaction(() -> { guard.requireBalanced(context(), settled); return null; });
        assertThat(ledger.chargeDebitNetForSettlement(Long.valueOf(TENANT), fixture.id()))
                .isEqualByComparingTo(ledger.creditNetForInvoice(Long.valueOf(TENANT), fixture.id()));

        // 人为制造账本不平：抹掉收费借方后同一结算单不再通过。
        jdbc.update("delete from RHN_BIL_LEDGER_ENTRY where ID_CHARGE_ITEM = ?", fixture.charge().id());
        assertThatThrownBy(() -> inTransaction(() -> { guard.requireBalanced(context(), settled); return null; }))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.code()).isEqualTo("SETTLEMENT_LEDGER_IMBALANCE"));
        // 必须处于事务内调用。
        assertThatThrownBy(() -> guard.requireBalanced(context(), settled))
                .isInstanceOf(org.springframework.transaction.IllegalTransactionStateException.class);
    }

    /** 住院预交金：存款分录不带结算凭证，按冲抵的 PREPAYMENT tender 金额计入凭证贷方，不被误杀。 */
    @Test
    void guard_counts_prepayment_tenders_whose_deposit_entry_has_no_invoice() throws Exception {
        Fixture fixture = fixture("100");
        Settlement settlement = settlements.findById(fixture.id()).orElseThrow();
        Payment deposit = payments.saveAndFlush(new Payment(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION),
                Long.valueOf(DEPARTMENT), fixture.accountId(), null, null, "DEP-" + UUID.randomUUID(), "PAYMENT", "CASH",
                "CASHIER", new BigDecimal("150"), "CNY", Instant.now(), null, null, USER, "预交金", "DEP-" + UUID.randomUUID()));
        ledger.saveAndFlush(new LedgerEntry(Long.valueOf(TENANT), fixture.accountId(), "PAYMENT", "CREDIT",
                new BigDecimal("150"), "CNY", null, null, deposit.id(), null, Instant.now(), USER));
        tenders.saveAndFlush(new SettlementTender(Long.valueOf(TENANT), settlement.id(), deposit.id(), 1, "PREPAYMENT",
                "CASH", "住院预交金", new BigDecimal("100"), "CNY"));
        inTransaction(() -> { guard.requireBalanced(context(), settlement); return null; });
    }

    private void assertRounded(Fixture fixture, String rounding, String net) {
        Settlement value = settlements.findById(fixture.id()).orElseThrow();
        assertThat(value.roundingAmount()).isEqualByComparingTo(rounding);
        assertThat(value.netAmount()).isEqualByComparingTo(net);
        assertThat(value.patientAmount()).isEqualByComparingTo(net);
        assertThat(invoices.findById(fixture.id()).orElseThrow().netAmount()).isEqualByComparingTo(net);
    }

    // ---------------------------------------------------------------- 夹具与辅助

    private void fundByInsurance(Fixture fixture, String fund) {
        BigDecimal amount = new BigDecimal(fund);
        Settlement settlement = settlements.findById(fixture.id()).orElseThrow();
        settlement.applyInsuranceAllocation(amount, BigDecimal.ZERO, settlement.netAmount().subtract(amount), BigDecimal.ZERO);
        settlements.saveAndFlush(settlement);
        tenders.saveAndFlush(new SettlementTender(Long.valueOf(TENANT), settlement.id(), (Long) null, 1,
                "INSURANCE_FUND", "TEST_PAYER", "测试医保", amount, "CNY"));
        ledger.saveAndFlush(LedgerEntry.insurance(Long.valueOf(TENANT), fixture.accountId(), "INSURANCE_FUND", amount,
                "CNY", fixture.id(), null, Instant.now(), USER));
    }

    private BigDecimal balance(Fixture fixture) { return ledger.balance(Long.valueOf(TENANT), fixture.accountId()); }

    private List<LedgerEntry> entries(Fixture fixture, String type) {
        return ledger.findByTenantIdAndInvoiceIdAndEntryTypeOrderByOccurredAtAscIdAsc(
                Long.valueOf(TENANT), fixture.id(), type);
    }

    private ExecutionContext context() {
        return new ExecutionContext(Long.valueOf(TENANT), USER, "doctor", "settlement-gate-test", Set.of(),
                Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT), "DEPARTMENT", Set.of(), Set.of());
    }

    private <T> T inTransaction(java.util.function.Supplier<T> action) {
        return new TransactionTemplate(transactionManager).execute(status -> action.get());
    }

    private ResultActions cancel(long orderId) throws Exception {
        return mockMvc.perform(post("/api/billing/payment-orders/{id}/cancel", orderId).with(rhnWorkContext()));
    }

    private ResultActions createOrder(Fixture fixture, String method, String amount, String adjustment) throws Exception {
        return pay(fixture, true, method, amount, adjustment);
    }

    private ResultActions pay(Fixture fixture, boolean order, String method, String amount, String adjustment) throws Exception {
        String key = UUID.randomUUID().toString();
        String body = """
                {"paymentNo":"%s","idempotencyKey":"%s","businessScene":"OUTPATIENT",
                 "paymentSceneCode":"CASHIER","paymentMethodCode":"%s","amount":%s,"roundingAdjustment":%s}
                """.formatted(key, key, method, amount, adjustment == null ? "null" : adjustment);
        return mockMvc.perform(post(order ? "/api/billing/settlements/{id}/payment-orders" : "/api/billing/invoices/{id}/payments", fixture.id())
                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    /** 底层夹具：账户、凭证、收费事项与 CHARGE 借方分录、结算单与结算行，使账本平衡校验可真实运行。 */
    private Fixture fixture(String gross) throws Exception {
        String key = UUID.randomUUID().toString();
        long residentId = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"fullName":"结算门禁患者","gender":"2","birthDate":"1992-02-02",
                         "identifiers":[{"system":"9","value":"%s","useType":"SECONDARY"}]}
                        """.formatted(key))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asLong();
        BigDecimal total = new BigDecimal(gross);
        var account = accounts.saveAndFlush(new PatientAccount(Long.valueOf(TENANT), residentId, null,
                Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT), "CNY"));
        Long catalogId = jdbc.queryForObject("select min(ID_CATALOG_ITEM) from RHN_BD_CATALOG_ITEM where ID_TNT=?", Long.class, Long.valueOf(TENANT));
        var invoice = invoices.saveAndFlush(new Invoice(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT),
                account.id(), "INV-" + key, "CNY", total, Instant.now(), USER));
        var charge = charges.saveAndFlush(new ChargeItem(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT),
                account.id(), residentId, null, null, catalogId, "SERVICE_REQUEST", invoice.id(), "GATE-" + invoice.id(),
                BigDecimal.ONE, "EA", total, total, "CNY", null, null, "SALE", "GATE-LAB", "结算门禁项目", Instant.now(),
                USER, null, "LABORATORY"));
        ledger.saveAndFlush(new LedgerEntry(Long.valueOf(TENANT), account.id(), "CHARGE", "DEBIT", total, "CNY",
                charge.id(), null, null, null, Instant.now(), USER));
        var line = invoiceLines.saveAndFlush(new com.rhn.billing.domain.InvoiceLine(
                Long.valueOf(TENANT), invoice.id(), charge.id(), 1, total));
        settlements.saveAndFlush(new Settlement(invoice.id(), Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT),
                account.id(), invoice.id(), "STL-" + key, key, "NORMAL", "OUTPATIENT", "CASHIER", total, "CNY", "TEST", USER, Instant.now()));
        settlementLines.saveAndFlush(new com.rhn.billing.domain.SettlementLine(
                Long.valueOf(TENANT), invoice.id(), charge.id(), line.id(), 1, charge.quantity(), total));
        return new Fixture(invoice, charge);
    }
}
