package com.rhn;

import com.rhn.billing.domain.Invoice;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.PaymentOrder;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.domain.SettlementStatus;
import com.rhn.billing.infrastructure.InvoiceRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.PaymentOrderRepository;
import com.rhn.billing.infrastructure.PaymentRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PaymentRoundingIntegrationTest extends RhnIntegrationTestSupport {
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired com.rhn.billing.infrastructure.ChargeItemRepository charges;
    @Autowired com.rhn.billing.infrastructure.InvoiceLineRepository invoiceLines;
    @Autowired com.rhn.billing.infrastructure.SettlementLineRepository settlementLines;
    @Autowired PatientAccountRepository accounts;
    @Autowired InvoiceRepository invoices;
    @Autowired SettlementRepository settlements;
    @Autowired PaymentOrderRepository orders;
    @Autowired PaymentRepository payments;

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void rejects_arbitrary_client_adjustment_without_changing_financial_facts(boolean order) throws Exception {
        Invoice invoice = fixture();
        for (String delta : new String[]{"0.03", "-10", "-0.08"}) {
            pay(invoice, order, "33.6", delta).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("PAYMENT_ROUNDING_MISMATCH"));
        }
        pay(invoice, order, "10", "-0.07").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PAYMENT_ROUNDING_FULL_PAYMENT_REQUIRED"));
        assertThat(invoices.findById(invoice.id()).orElseThrow().netAmount()).isEqualByComparingTo("33.67");
        var value = settlements.findById(invoice.id()).orElseThrow();
        assertThat(value.roundingAmount()).isZero();
        assertThat(value.status()).isEqualTo(SettlementStatus.PRICED);
        assertThat(payments.netPaidForInvoice(Long.valueOf(TENANT), invoice.id())).isZero();
        assertThat(orders.findTop100ByTenantIdAndPatientAccountIdOrderByCreatedAtDesc(Long.valueOf(TENANT), invoice.patientAccountId())).isEmpty();
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void rounds_actual_remaining_balance_and_records_only_the_validated_difference(boolean order) throws Exception {
        Invoice invoice = fixture();
        pay(invoice, false, "10.01", null).andExpect(status().isCreated());
        // Dictionary CASH is configured to 0.1 / FLOOR: 33.67 - 10.01 = 23.66 -> 23.6.
        pay(invoice, order, "23.6", "-0.06").andExpect(status().isCreated());
        var value = settlements.findById(invoice.id()).orElseThrow();
        assertThat(value.status()).isEqualTo(SettlementStatus.SETTLED);
        assertThat(value.roundingAmount()).isEqualByComparingTo("-0.06");
        assertThat(value.netAmount()).isEqualByComparingTo("33.61");
        assertThat(invoices.findById(invoice.id()).orElseThrow().netAmount()).isEqualByComparingTo("33.61");
        assertThat(payments.netPaidForInvoice(Long.valueOf(TENANT), invoice.id())).isEqualByComparingTo("33.61");
        Long catalogId = jdbc.queryForObject("select min(ID_CATALOG_ITEM) from RHN_BD_CATALOG_ITEM where ID_TNT=?", Long.class, Long.valueOf(TENANT));
        var charge = charges.saveAndFlush(new com.rhn.billing.domain.ChargeItem(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT),
                invoice.patientAccountId(), accounts.findById(invoice.patientAccountId()).orElseThrow().residentId(), null, null, catalogId,
                "SERVICE_REQUEST", invoice.id(), "ROUND-"+invoice.id(), BigDecimal.ONE, "EA", new BigDecimal("33.67"), new BigDecimal("33.67"),
                "CNY", null, null, "SALE", "ROUND-LAB", "舍入检验项目", Instant.now(), 362387869790222L, null, "LABORATORY"));
        var original = invoiceLines.saveAndFlush(new com.rhn.billing.domain.InvoiceLine(Long.valueOf(TENANT), invoice.id(), charge.id(), 1, charge.totalAmount()));
        settlementLines.saveAndFlush(new com.rhn.billing.domain.SettlementLine(Long.valueOf(TENANT), invoice.id(), charge.id(), original.id(), 1, charge.quantity(), charge.totalAmount()));
        var receipt = json(mockMvc.perform(post("/api/billing/settlements/{id}/receipts", invoice.id()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"idempotencyKey\":\"ROUND-RECEIPT-"+invoice.id()+"\",\"receiptType\":\"PAPER_INVOICE\",\"issueChannel\":\"CASHIER\",\"fiscalAuthorityCode\":\"ROUND_TEST_QUEUE\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        var payload = json(jdbc.queryForObject("select JSON_PAYLOAD from RHN_INT_EXT_MSG where SD_RELATED_RSRC_TYPE='Receipt' and ID_RELATED_RSRC=? and SD_MSG_TYPE='RECEIPT_ISSUE'", String.class, receipt.get("id").asLong()));
        assertThat(payload.get("amount").decimalValue()).isEqualByComparingTo("33.61");
        assertThat(payload.get("roundingAmount").decimalValue()).isEqualByComparingTo("-0.06");
        assertThat(payload.get("lines").get(0).get("amount").decimalValue()).isEqualByComparingTo("33.67");
        assertThat(payload.get("lines").get(0).get("categoryCode").asString()).isEqualTo("LABORATORY");
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void cannot_change_invoice_rounding_under_a_pending_payment(boolean order) throws Exception {
        Invoice invoice = fixture();
        orders.saveAndFlush(new PaymentOrder(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT),
                invoice.patientAccountId(), invoice.id(), null, "PO-" + UUID.randomUUID(), "KEY-" + UUID.randomUUID(),
                "OUTPATIENT", "CASHIER", "CASH", "现金", "SETTLEMENT_PAY", new BigDecimal("10"), "CNY",
                "test", "TEST", null, 362387869790222L));
        pay(invoice, order, "33.6", "-0.07").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PAYMENT_ROUNDING_PENDING_ORDER"));
        assertThat(invoices.findById(invoice.id()).orElseThrow().netAmount()).isEqualByComparingTo("33.67");
        assertThat(payments.netPaidForInvoice(Long.valueOf(TENANT), invoice.id())).isZero();
    }

    private ResultActions pay(Invoice invoice, boolean order, String amount, String adjustment) throws Exception {
        String key = UUID.randomUUID().toString();
        String body = """
                {"paymentNo":"%s","idempotencyKey":"%s","businessScene":"OUTPATIENT",
                 "paymentSceneCode":"CASHIER","paymentMethodCode":"CASH","amount":%s,"roundingAdjustment":%s}
                """.formatted(key, key, amount, adjustment == null ? "null" : adjustment);
        return mockMvc.perform(post(order ? "/api/billing/settlements/{id}/payment-orders" : "/api/billing/invoices/{id}/payments", invoice.id())
                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private Invoice fixture() throws Exception {
        String key = UUID.randomUUID().toString();
        long residentId = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"fullName":"舍入校验患者","gender":"FEMALE","birthDate":"1992-02-02",
                         "identifiers":[{"system":"9","value":"%s","useType":"SECONDARY"}]}
                        """.formatted(key))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asLong();
        var account = accounts.saveAndFlush(new PatientAccount(Long.valueOf(TENANT), residentId, null,
                Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT), "CNY"));
        var invoice = invoices.saveAndFlush(new Invoice(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT),
                account.id(), "INV-" + key, "CNY", new BigDecimal("33.67"), Instant.now(), 362387869790222L));
        settlements.saveAndFlush(new Settlement(invoice.id(), Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT),
                account.id(), invoice.id(), "STL-" + key, key, "NORMAL", "OUTPATIENT", "CASHIER",
                new BigDecimal("33.67"), "CNY", "TEST", 362387869790222L, Instant.now()));
        return invoice;
    }
}
