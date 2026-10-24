package com.rhn;

import com.rhn.billing.application.SettlementRoundingLedger;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.Invoice;
import com.rhn.billing.domain.LedgerEntry;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.domain.SettlementStatus;
import com.rhn.billing.domain.SettlementTender;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.InvoiceLineRepository;
import com.rhn.billing.infrastructure.InvoiceRepository;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.SettlementLineRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.billing.infrastructure.SettlementTenderRepository;
import com.rhn.shared.context.ExecutionContext;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 结算舍入差额（抹零/进位）随结算结清写入患者账本，账户余额回零；整单冲销时同步冲回。 */
class SettlementRoundingLedgerIntegrationTest extends RhnIntegrationTestSupport {
    private static final long USER = 362387869790222L;

    @Autowired ChargeItemRepository charges;
    @Autowired InvoiceLineRepository invoiceLines;
    @Autowired SettlementLineRepository settlementLines;
    @Autowired SettlementTenderRepository tenders;
    @Autowired PatientAccountRepository accounts;
    @Autowired InvoiceRepository invoices;
    @Autowired SettlementRepository settlements;
    @Autowired LedgerEntryRepository ledger;
    @Autowired SettlementRoundingLedger rounding;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    private record Fixture(Invoice invoice, ChargeItem charge) {
        Long accountId() { return invoice.patientAccountId(); }
    }

    /** 抹零：现金 0.1 精度 FLOOR，33.67 -> 33.6，舍入 -0.07；现金与支付指令两条入口汇合到同一结清点。 */
    @ParameterizedTest @ValueSource(booleans = {false, true})
    void abatement_is_booked_as_credit_and_balance_returns_to_zero(boolean order) throws Exception {
        Fixture fixture = fixture("33.67");
        assertThat(balance(fixture)).isEqualByComparingTo("33.67");
        pay(fixture.invoice(), order, "CASH", "33.6", "-0.07").andExpect(status().isCreated());
        assertThat(settlements.findById(fixture.invoice().id()).orElseThrow().status()).isEqualTo(SettlementStatus.SETTLED);
        List<LedgerEntry> entries = entries(fixture, SettlementRoundingLedger.ROUNDING);
        assertThat(entries).hasSize(1);
        assertThat(entries.getFirst().direction()).isEqualTo("CREDIT");
        assertThat(entries.getFirst().amount()).isEqualByComparingTo("0.07");
        assertThat(entries.getFirst().invoiceId()).isEqualTo(fixture.invoice().id());
        assertThat(balance(fixture)).isEqualByComparingTo("0");
    }

    /** 进位：银行卡 0.01 精度 HALF_UP，33.675 -> 33.68，舍入 +0.005，记借方。 */
    @Test
    void carry_up_is_booked_as_debit_and_balance_returns_to_zero() throws Exception {
        Fixture fixture = fixture("33.675");
        pay(fixture.invoice(), false, "BANK_CARD", "33.68", "0.005").andExpect(status().isCreated());
        assertThat(settlements.findById(fixture.invoice().id()).orElseThrow().status()).isEqualTo(SettlementStatus.SETTLED);
        List<LedgerEntry> entries = entries(fixture, SettlementRoundingLedger.ROUNDING);
        assertThat(entries).hasSize(1);
        assertThat(entries.getFirst().direction()).isEqualTo("DEBIT");
        assertThat(entries.getFirst().amount()).isEqualByComparingTo("0.005");
        assertThat(balance(fixture)).isEqualByComparingTo("0");
    }

    @Test
    void zero_rounding_writes_no_entry() throws Exception {
        Fixture fixture = fixture("33.60");
        pay(fixture.invoice(), false, "CASH", "33.6", null).andExpect(status().isCreated());
        assertThat(settlements.findById(fixture.invoice().id()).orElseThrow().status()).isEqualTo(SettlementStatus.SETTLED);
        assertThat(entries(fixture, SettlementRoundingLedger.ROUNDING)).isEmpty();
        assertThat(balance(fixture)).isEqualByComparingTo("0");
    }

    @Test
    void replaying_the_finalization_does_not_book_rounding_twice() throws Exception {
        Fixture fixture = fixture("33.67");
        pay(fixture.invoice(), false, "CASH", "33.6", "-0.07").andExpect(status().isCreated());
        Settlement settled = settlements.findById(fixture.invoice().id()).orElseThrow();
        for (int attempt = 0; attempt < 2; attempt++) {
            BigDecimal booked = inTransaction(() -> rounding.recordOnFinalize(context(), settled, Instant.now()));
            assertThat(booked).isEqualByComparingTo("0");
        }
        assertThat(entries(fixture, SettlementRoundingLedger.ROUNDING)).hasSize(1);
        assertThat(balance(fixture)).isEqualByComparingTo("0");
    }

    /** 整单冲销：收费冲销后，可退余额恰好等于实付；冲回舍入幂等，部分冲销不动舍入。 */
    @Test
    void full_charge_reversal_reverses_rounding_once_and_partial_reversal_keeps_it() throws Exception {
        Fixture fixture = fixture("33.67");
        pay(fixture.invoice(), false, "CASH", "33.6", "-0.07").andExpect(status().isCreated());
        assertThat(balance(fixture)).isEqualByComparingTo("0");

        ChargeItem partial = reversalCharge(fixture, "-16.00");
        assertThat(inTransaction(() -> rounding.reverseForChargeReversals(context(), List.of(partial), Instant.now())))
                .isEqualByComparingTo("0");
        assertThat(entries(fixture, SettlementRoundingLedger.ROUNDING_REVERSAL)).isEmpty();

        ChargeItem rest = reversalCharge(fixture, "-17.67");
        BigDecimal debited = inTransaction(() -> rounding.reverseForChargeReversals(context(), List.of(rest), Instant.now()));
        assertThat(debited).isEqualByComparingTo("0.07");
        List<LedgerEntry> reversals = entries(fixture, SettlementRoundingLedger.ROUNDING_REVERSAL);
        assertThat(reversals).hasSize(1);
        assertThat(reversals.getFirst().direction()).isEqualTo("DEBIT");
        assertThat(reversals.getFirst().amount()).isEqualByComparingTo("0.07");
        assertThat(reversals.getFirst().reversesLedgerEntryId())
                .isEqualTo(entries(fixture, SettlementRoundingLedger.ROUNDING).getFirst().id());
        assertThat(inTransaction(() -> rounding.reverseForChargeReversals(context(), List.of(rest), Instant.now())))
                .isEqualByComparingTo("0");
        assertThat(entries(fixture, SettlementRoundingLedger.ROUNDING_REVERSAL)).hasSize(1);

        // 收费冲销 CHARGE_REVERSAL 全额贷方 33.67，借方冲回舍入 0.07：账户可退余额 = 实付 33.60，退款后归零。
        ledger.save(new LedgerEntry(Long.valueOf(TENANT), fixture.accountId(), "CHARGE_REVERSAL", "CREDIT",
                new BigDecimal("33.67"), "CNY", null, null, null, null, Instant.now(), USER));
        assertThat(balance(fixture)).isEqualByComparingTo("-33.60");
        ledger.save(new LedgerEntry(Long.valueOf(TENANT), fixture.accountId(), "PAYMENT_REFUND", "DEBIT",
                new BigDecimal("33.60"), "CNY", null, null, null, null, Instant.now(), USER));
        assertThat(balance(fixture)).isEqualByComparingTo("0");
    }

    /** 医保 + 个人自付：gross 153.30，医保 122.64，个人 30.66 抹零为 30.60，舍入 -0.06，账户余额为零。 */
    @Test
    void insurance_plus_self_pay_abatement_leaves_no_residual_balance() throws Exception {
        Fixture fixture = fixture("153.30");
        Settlement settlement = settlements.findById(fixture.invoice().id()).orElseThrow();
        settlement.applyInsuranceAllocation(new BigDecimal("122.64"), BigDecimal.ZERO, new BigDecimal("30.66"), BigDecimal.ZERO);
        settlements.saveAndFlush(settlement);
        tenders.saveAndFlush(new SettlementTender(Long.valueOf(TENANT), settlement.id(), (Long) null, 1,
                "INSURANCE_FUND", "TEST_PAYER", "测试医保", new BigDecimal("122.64"), "CNY"));
        ledger.save(LedgerEntry.insurance(Long.valueOf(TENANT), fixture.accountId(), "INSURANCE_FUND",
                new BigDecimal("122.64"), "CNY", fixture.invoice().id(), null, Instant.now(), USER));
        assertThat(balance(fixture)).isEqualByComparingTo("30.66");

        pay(fixture.invoice(), false, "CASH", "30.6", "-0.06").andExpect(status().isCreated());

        Settlement settled = settlements.findById(fixture.invoice().id()).orElseThrow();
        assertThat(settled.status()).isEqualTo(SettlementStatus.SETTLED);
        assertThat(settled.netAmount()).isEqualByComparingTo("153.24");
        List<LedgerEntry> entries = entries(fixture, SettlementRoundingLedger.ROUNDING);
        assertThat(entries).hasSize(1);
        assertThat(entries.getFirst().direction()).isEqualTo("CREDIT");
        assertThat(entries.getFirst().amount()).isEqualByComparingTo("0.06");
        assertThat(balance(fixture)).isEqualByComparingTo("0");
    }

    private ChargeItem reversalCharge(Fixture fixture, String total) {
        ChargeItem original = fixture.charge();
        BigDecimal amount = new BigDecimal(total);
        return charges.saveAndFlush(new ChargeItem(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT),
                original.patientAccountId(), original.residentId(), null, null, original.catalogItemId(),
                "DIRECT_REFUND", com.rhn.shared.id.GlobalIds.next(), "REF-" + UUID.randomUUID(), amount.divide(original.totalAmount(), 6,
                java.math.RoundingMode.HALF_UP), "EA", original.unitPrice(), amount, "CNY", null, null, "SALE",
                original.itemCodeSnapshot(), original.itemNameSnapshot(), Instant.now(), USER, original.id(), "LABORATORY"));
    }

    private BigDecimal balance(Fixture fixture) { return ledger.balance(Long.valueOf(TENANT), fixture.accountId()); }

    private List<LedgerEntry> entries(Fixture fixture, String type) {
        return ledger.findByTenantIdAndInvoiceIdAndEntryTypeOrderByOccurredAtAscIdAsc(
                Long.valueOf(TENANT), fixture.invoice().id(), type);
    }

    private ExecutionContext context() {
        return new ExecutionContext(Long.valueOf(TENANT), USER, "doctor", "rounding-ledger-test", Set.of(),
                Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT), "DEPARTMENT", Set.of(), Set.of());
    }

    private <T> T inTransaction(java.util.function.Supplier<T> action) {
        return new TransactionTemplate(transactionManager).execute(status -> action.get());
    }

    private ResultActions pay(Invoice invoice, boolean order, String method, String amount, String adjustment) throws Exception {
        String key = UUID.randomUUID().toString();
        String body = """
                {"paymentNo":"%s","idempotencyKey":"%s","businessScene":"OUTPATIENT",
                 "paymentSceneCode":"CASHIER","paymentMethodCode":"%s","amount":%s,"roundingAdjustment":%s}
                """.formatted(key, key, method, amount, adjustment == null ? "null" : adjustment);
        return mockMvc.perform(post(order ? "/api/billing/settlements/{id}/payment-orders" : "/api/billing/invoices/{id}/payments", invoice.id())
                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    /** 与 PaymentRoundingIntegrationTest 相同的底层夹具，另补收费事项、结算行与 CHARGE 借方账务，使账本余额可验证。 */
    private Fixture fixture(String gross) throws Exception {
        String key = UUID.randomUUID().toString();
        long residentId = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"fullName":"舍入入账患者","gender":"2","birthDate":"1992-02-02",
                         "identifiers":[{"system":"9","value":"%s","useType":"SECONDARY"}]}
                        """.formatted(key))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asLong();
        BigDecimal total = new BigDecimal(gross);
        var account = accounts.saveAndFlush(new PatientAccount(Long.valueOf(TENANT), residentId, null,
                Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT), "CNY"));
        Long catalogId = jdbc.queryForObject("select min(ID_CATALOG_ITEM) from RHN_BD_CATALOG_ITEM where ID_TNT=?", Long.class, Long.valueOf(TENANT));
        var invoice = invoices.saveAndFlush(new Invoice(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT),
                account.id(), "INV-" + key, "CNY", total, Instant.now(), USER));
        var charge = charges.saveAndFlush(new ChargeItem(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT),
                account.id(), residentId, null, null, catalogId, "SERVICE_REQUEST", invoice.id(), "ROUND-" + invoice.id(),
                BigDecimal.ONE, "EA", total, total, "CNY", null, null, "SALE", "ROUND-LAB", "舍入入账项目", Instant.now(),
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
