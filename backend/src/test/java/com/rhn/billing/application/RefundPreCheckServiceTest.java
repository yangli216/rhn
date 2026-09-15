package com.rhn.billing.application;

import com.rhn.billing.api.RefundPreCheckViews.RefundItemPreCheckView;
import com.rhn.billing.api.RefundPreCheckViews.RefundPreCheckSummaryView;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.Payment;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.PaymentRepository;
import com.rhn.billing.api.RefundDiagnosticDirectory;
import com.rhn.pharmacy.api.RefundPharmacyDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.billing.api.RefundTreatmentDirectory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RefundPreCheckServiceTest {

    private PatientAccountRepository accounts;
    private ChargeItemRepository charges;
    private PaymentRepository payments;
    private RefundPharmacyDirectory pharmacy;
    private RefundDiagnosticDirectory diagnostics;
    private RefundTreatmentDirectory treatment;
    private RefundPolicy refundPolicy;
    private ExecutionContextProvider contextProvider;

    private RefundPreCheckService service;
    private final ExecutionContext context = new ExecutionContext(1L, 2L, "operator", "corr-1", Set.of());

    @BeforeEach
    void setUp() {
        accounts = mock(PatientAccountRepository.class);
        charges = mock(ChargeItemRepository.class);
        payments = mock(PaymentRepository.class);
        pharmacy = mock(RefundPharmacyDirectory.class);
        diagnostics = mock(RefundDiagnosticDirectory.class);
        treatment = mock(RefundTreatmentDirectory.class);
        refundPolicy = mock(RefundPolicy.class);
        contextProvider = mock(ExecutionContextProvider.class);
        when(contextProvider.requireCurrent()).thenReturn(context);
        service = new RefundPreCheckService(
                accounts, charges, payments, pharmacy, diagnostics, treatment, refundPolicy, contextProvider);
    }

    @Test
    void whenNoAccountFound_shouldReturnBlockedSummary() {
        Long encounterId = 100L;
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(encounterId))).thenReturn(List.of());

        RefundPreCheckSummaryView result = service.preCheck(encounterId);

        assertNotNull(result);
        assertFalse(result.eligibleForRefund());
        assertEquals("BLOCKED", result.overallDecision());
        assertTrue(result.summaryNotice().contains("未检索到该就诊对应的有效费用账户"));
    }

    @Test
    void whenMedicationDispensed_shouldBlockRefund() {
        Long encounterId = 100L;
        PatientAccount account = account(encounterId, 10L);
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(encounterId))).thenReturn(List.of(account));
        ChargeItem charge = charge(501L, "MEDICATION_REQUEST", 8001L, "头孢克肟胶囊", "35.00");
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, 10L)).thenReturn(List.of(charge));
        when(refundPolicy.isUnexecutedDirectRefundAllowed(any(), any(), any())).thenReturn(true);
        when(pharmacy.statusForRequest(1L, 8001L))
                .thenReturn(new RefundPharmacyDirectory.RefundFulfillmentStatus("DISPENSED", "COMPLETED"));

        RefundPreCheckSummaryView result = service.preCheck(encounterId);

        assertFalse(result.eligibleForRefund());
        assertEquals("BLOCKED", result.overallDecision());
        RefundItemPreCheckView item = result.items().get(0);
        assertFalse(item.allowed());
        assertEquals("DISPENSED", item.executionStatusCode());
    }

    @Test
    void whenReportIssued_shouldBlockRefund() {
        Long encounterId = 100L;
        PatientAccount account = account(encounterId, 10L);
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(encounterId))).thenReturn(List.of(account));
        ChargeItem charge = charge(502L, "SERVICE_REQUEST", 8002L, "血常规", "20.00");
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, 10L)).thenReturn(List.of(charge));
        when(refundPolicy.isUnexecutedDirectRefundAllowed(any(), any(), any())).thenReturn(true);
        when(diagnostics.hasReportForRequest(1L, 8002L)).thenReturn(true);

        RefundPreCheckSummaryView result = service.preCheck(encounterId);

        assertFalse(result.eligibleForRefund());
        assertEquals("BLOCKED", result.overallDecision());
        assertEquals("REPORTED", result.items().get(0).executionStatusCode());
    }

    @Test
    void whenUnexecutedAndPolicyEnabled_shouldAllowDirectRefund() {
        Long encounterId = 100L;
        PatientAccount account = account(encounterId, 10L);
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(encounterId))).thenReturn(List.of(account));
        ChargeItem charge = charge(503L, "MEDICATION_REQUEST", 8003L, "感冒清热颗粒", "30.00");
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, 10L)).thenReturn(List.of(charge));
        when(refundPolicy.isUnexecutedDirectRefundAllowed(any(), any(), any())).thenReturn(true);
        when(pharmacy.statusForRequest(1L, 8003L)).thenReturn(RefundPharmacyDirectory.RefundFulfillmentStatus.undispensed("PENDING"));

        Payment payment = mock(Payment.class);
        when(payment.id()).thenReturn(701L);
        when(payment.paymentNo()).thenReturn("PAY701");
        when(payment.paymentMethodCode()).thenReturn("WECHAT");
        when(payment.paymentType()).thenReturn("PAYMENT");
        when(payment.amount()).thenReturn(new BigDecimal("30.00"));
        when(payment.currencyCode()).thenReturn("CNY");
        when(payment.paidAt()).thenReturn(Instant.now());
        when(payments.findByTenantIdAndPatientAccountIdOrderByPaidAtAscIdAsc(1L, 10L)).thenReturn(List.of(payment));

        RefundPreCheckSummaryView result = service.preCheck(encounterId);

        assertTrue(result.eligibleForRefund());
        assertEquals("ALLOWED", result.overallDecision());
        assertEquals(new BigDecimal("30.00"), result.refundableAmount());
        assertEquals("UNDISPENSED", result.items().get(0).executionStatusCode());
    }

    @Test
    void whenUnexecutedAndPolicyDisabled_shouldBlockAndRequireCancel() {
        Long encounterId = 100L;
        PatientAccount account = account(encounterId, 10L);
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(encounterId))).thenReturn(List.of(account));
        ChargeItem charge = charge(504L, "MEDICATION_REQUEST", 8004L, "阿莫西林", "18.00");
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, 10L)).thenReturn(List.of(charge));
        when(refundPolicy.isUnexecutedDirectRefundAllowed(any(), any(), any())).thenReturn(false);
        when(pharmacy.statusForRequest(1L, 8004L)).thenReturn(RefundPharmacyDirectory.RefundFulfillmentStatus.undispensed("PENDING"));

        RefundPreCheckSummaryView result = service.preCheck(encounterId);

        assertFalse(result.eligibleForRefund());
        assertEquals("BLOCKED", result.overallDecision());
        assertEquals("UNDISPENSED_NEED_CANCEL", result.items().get(0).executionStatusCode());
    }

    private PatientAccount account(Long encounterId, Long accountId) {
        PatientAccount account = mock(PatientAccount.class);
        when(account.id()).thenReturn(accountId);
        when(account.encounterId()).thenReturn(encounterId);
        when(account.organizationId()).thenReturn(1001L);
        when(account.currencyCode()).thenReturn("CNY");
        return account;
    }

    private ChargeItem charge(Long id, String sourceType, Long sourceId, String name, String total) {
        ChargeItem charge = mock(ChargeItem.class);
        when(charge.id()).thenReturn(id);
        when(charge.sourceType()).thenReturn(sourceType);
        when(charge.sourceId()).thenReturn(sourceId);
        when(charge.requestCode()).thenReturn("REQ-" + id);
        when(charge.itemNameSnapshot()).thenReturn(name);
        when(charge.itemCodeSnapshot()).thenReturn("ITEM-" + id);
        when(charge.quantity()).thenReturn(BigDecimal.ONE);
        when(charge.unitCode()).thenReturn("次");
        when(charge.totalAmount()).thenReturn(new BigDecimal(total));
        return charge;
    }
}
