package com.rhn.billing.application;

import com.rhn.billing.api.BillingViews.SettlementExceptionView;
import com.rhn.billing.api.BillingViews.SettlementRecordView;
import com.rhn.billing.domain.InsuranceClaim;
import com.rhn.billing.domain.PaymentOrder;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.domain.SettlementStatus;
import com.rhn.billing.infrastructure.InsuranceClaimRepository;
import com.rhn.billing.infrastructure.PaymentOrderRepository;
import com.rhn.billing.infrastructure.PaymentRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SettlementExceptionServiceTest {
    private static final Instant NOW = Instant.parse("2026-10-23T08:00:00Z");
    private final SettlementRepository settlements = mock(SettlementRepository.class);
    private final InsuranceClaimRepository claims = mock(InsuranceClaimRepository.class);
    private final PaymentOrderRepository orders = mock(PaymentOrderRepository.class);
    private final PaymentRepository payments = mock(PaymentRepository.class);
    private final SettlementApplicationService settlementService = mock(SettlementApplicationService.class);
    private SettlementExceptionService service;

    @BeforeEach void setUp() {
        var contexts = mock(ExecutionContextProvider.class);
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(10L, 11L, "test", "test", Set.of(),
                20L, 30L, "ORGANIZATION", Set.of(20L), Set.of(30L)));
        service = new SettlementExceptionService(settlements, claims, orders, payments, settlementService, contexts,
                Clock.fixed(NOW, ZoneOffset.UTC), 10, 2);
        when(payments.netPaidForInvoice(any(), any())).thenReturn(BigDecimal.ZERO);
        when(settlementService.nonPaymentTendered(any(), any())).thenReturn(BigDecimal.ZERO);
    }

    private Settlement open(long id, int ageMinutes, String scene) {
        var value = mock(Settlement.class);
        when(value.id()).thenReturn(id); when(value.legacyInvoiceId()).thenReturn(id + 1000);
        when(value.status()).thenReturn(SettlementStatus.PRICED); when(value.settlementScene()).thenReturn(scene);
        when(value.netAmount()).thenReturn(new BigDecimal("24.00"));
        when(value.createdAt()).thenReturn(NOW.minus(Duration.ofMinutes(ageMinutes)));
        when(settlements.findOpenSince(any(), any(), any(), any(), any())).thenReturn(List.of(value));
        var view = mock(SettlementRecordView.class);
        when(view.id()).thenReturn(id);
        when(settlementService.recordViews(any(), any())).thenReturn(List.of(view));
        return value;
    }

    private InsuranceClaim claim(long settlementId, String status, String operation, int updatedMinutesAgo) {
        var value = mock(InsuranceClaim.class);
        when(value.id()).thenReturn(7L); when(value.settlementId()).thenReturn(settlementId);
        when(value.status()).thenReturn(status); when(value.currentOperation()).thenReturn(operation);
        when(value.updatedAt()).thenReturn(NOW.minus(Duration.ofMinutes(updatedMinutesAgo)));
        when(claims.findByTenantIdAndSettlementIdIn(any(), any())).thenReturn(List.of(value));
        return value;
    }

    private PaymentOrder order(long settlementId, String status, int createdMinutesAgo) {
        var value = mock(PaymentOrder.class);
        when(value.id()).thenReturn(9L); when(value.invoiceId()).thenReturn(settlementId + 1000);
        when(value.orderType()).thenReturn("SETTLEMENT_PAY"); when(value.status()).thenReturn(status);
        when(value.createdAt()).thenReturn(NOW.minus(Duration.ofMinutes(createdMinutesAgo)));
        when(value.updatedAt()).thenReturn(NOW.minus(Duration.ofMinutes(createdMinutesAgo)));
        when(orders.findByTenantIdAndInvoiceIdIn(any(), any())).thenReturn(List.of(value));
        return value;
    }

    private SettlementExceptionView only() {
        var result = service.exceptions(50);
        assertThat(result).hasSize(1);
        return result.get(0);
    }

    @Test void insurance_settled_but_self_pay_not_collected_is_a_critical_one_sided_account() {
        open(1, 5, "OUTPATIENT"); claim(1, "SETTLED", "SETTLE", 5);
        var item = only();
        assertThat(item.exceptionType()).isEqualTo("INSURANCE_SETTLED_UNPAID");
        assertThat(item.severity()).isEqualTo("CRITICAL");
        assertThat(item.outstandingAmount()).isEqualByComparingTo("24.00");
        assertThat(item.actions()).contains("COLLECT", "CANCEL_AND_REVERSE");
    }

    @Test void normal_payment_in_progress_right_after_insurance_settlement_is_not_flagged() {
        open(1, 1, "OUTPATIENT"); claim(1, "SETTLED", "SETTLE", 0); order(1, "PROCESSING", 0);
        assertThat(service.exceptions(50)).isEmpty();
    }

    @Test void payment_succeeded_but_settlement_not_completed_is_critical() {
        open(1, 3, "OUTPATIENT"); order(1, "SUCCEEDED", 3);
        var item = only();
        assertThat(item.exceptionType()).isEqualTo("PAID_NOT_COMPLETED");
        assertThat(item.actions()).contains("RETRY_COMPLETION");
    }

    @Test void uncertain_insurance_settlement_is_critical_even_without_payment() {
        open(1, 5, "OUTPATIENT"); claim(1, "SETTLEMENT_PENDING", "SETTLE", 5);
        assertThat(only().exceptionType()).isEqualTo("INSURANCE_SETTLE_UNCERTAIN");
    }

    @Test void stale_active_payment_order_is_unknown_result_warning() {
        open(1, 30, "OUTPATIENT"); order(1, "PENDING", 20);
        var item = only();
        assertThat(item.exceptionType()).isEqualTo("PAYMENT_RESULT_UNKNOWN");
        assertThat(item.severity()).isEqualTo("WARNING");
    }

    @Test void plain_unpaid_settlement_is_flagged_only_after_the_timeout() {
        open(1, 9, "OUTPATIENT");
        assertThat(service.exceptions(50)).isEmpty();
        open(1, 11, "OUTPATIENT");
        assertThat(only().exceptionType()).isEqualTo("UNPAID_TIMEOUT");
    }

    @Test void unpaid_registration_settlement_is_left_to_slot_expiry() {
        open(1, 60, "REGISTRATION");
        assertThat(service.exceptions(50)).isEmpty();
    }
}
