package com.rhn.coordination.application;

import com.rhn.billing.api.PaymentResultDirectory.PaymentOrderView;
import com.rhn.billing.api.RefundBillingDirectory;
import com.rhn.billing.api.RefundBillingDirectory.RefundBillingSnapshot;
import com.rhn.billing.api.RefundBillingDirectory.RefundChargeSnapshot;
import com.rhn.billing.api.RefundBillingDirectory.RefundPaymentContext;
import com.rhn.billing.api.RefundPreCheckViews.DirectRefundCommand;
import com.rhn.billing.api.RefundPreCheckViews.RefundPaymentCandidateView;
import com.rhn.billing.api.RefundPreCheckViews.RefundPreCheckSummaryView;
import com.rhn.diagnostics.api.RefundDiagnosticDirectory;
import com.rhn.pharmacy.api.RefundPharmacyDirectory;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.treatment.api.RefundTreatmentDirectory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RefundProcessCoordinatorTest {

    private RefundBillingDirectory billing;
    private RefundPharmacyDirectory pharmacy;
    private RefundDiagnosticDirectory diagnostics;
    private RefundTreatmentDirectory treatment;
    private ExecutionContextProvider contextProvider;
    private RefundProcessCoordinator coordinator;

    @BeforeEach
    void setUp() {
        billing = mock(RefundBillingDirectory.class);
        pharmacy = mock(RefundPharmacyDirectory.class);
        diagnostics = mock(RefundDiagnosticDirectory.class);
        treatment = mock(RefundTreatmentDirectory.class);
        contextProvider = mock(ExecutionContextProvider.class);
        when(contextProvider.requireCurrent())
                .thenReturn(new ExecutionContext(1L, 2L, "operator", "corr-1", Set.of()));
        coordinator = new RefundProcessCoordinator(
                billing, pharmacy, diagnostics, treatment, contextProvider);
    }

    @Test
    void dispensedMedication_shouldBlockRefundBeforeBillingExecution() {
        long encounterId = 100L;
        when(billing.snapshotForEncounter(encounterId)).thenReturn(snapshot(
                encounterId,
                charge(501L, "MEDICATION_REQUEST", 8001L, "阿莫西林", "60.00"),
                true));
        when(pharmacy.statusForRequest(1L, 8001L))
                .thenReturn(new RefundPharmacyDirectory.RefundFulfillmentStatus("DISPENSED", "COMPLETED"));

        RefundPreCheckSummaryView preCheck = coordinator.preCheck(encounterId);

        assertFalse(preCheck.eligibleForRefund());
        assertEquals("BLOCKED", preCheck.overallDecision());
        assertEquals("DISPENSED", preCheck.items().get(0).executionStatusCode());

        when(billing.paymentContext(1000L)).thenReturn(new RefundPaymentContext(1000L, 10L, encounterId));
        DirectRefundCommand command = new DirectRefundCommand(
                "IDEMP-1", new BigDecimal("60.00"), "患者退费", "CASHIER", List.of(501L));

        assertThrows(BusinessException.class, () -> coordinator.directRefund(1000L, command));
        verify(billing, never()).executeDirectRefund(any(), any());
    }

    @Test
    void issuedReportAndExecutedTreatment_shouldBeEvaluatedByCoordination() {
        long encounterId = 101L;
        RefundChargeSnapshot diagnostic = charge(601L, "SERVICE_REQUEST", 9001L, "血常规", "20.00");
        RefundChargeSnapshot treatmentCharge = charge(602L, "TREATMENT", 9002L, "雾化治疗", "30.00");
        when(billing.snapshotForEncounter(encounterId)).thenReturn(new RefundBillingSnapshot(
                encounterId, 11L, 1001L, true, new BigDecimal("50.00"), "CNY",
                List.of(diagnostic, treatmentCharge),
                List.of(paymentCandidate(1001L, "50.00"))));
        when(diagnostics.hasReportForRequest(1L, 9001L)).thenReturn(true);
        when(treatment.isExecutedOrInProgress(1L, 9002L)).thenReturn(true);

        RefundPreCheckSummaryView preCheck = coordinator.preCheck(encounterId);

        assertEquals("BLOCKED", preCheck.overallDecision());
        assertEquals("REPORTED", preCheck.items().get(0).executionStatusCode());
        assertEquals("EXECUTED", preCheck.items().get(1).executionStatusCode());
        assertFalse(preCheck.eligibleForRefund());
    }

    @Test
    void allowedMedicationRefund_shouldExecuteBillingThenRequestPharmacyCancellation() {
        long encounterId = 102L;
        long paymentId = 1002L;
        when(billing.paymentContext(paymentId)).thenReturn(new RefundPaymentContext(paymentId, 12L, encounterId));
        when(billing.snapshotForEncounter(encounterId)).thenReturn(snapshot(
                encounterId,
                charge(701L, "MEDICATION_REQUEST", 9101L, "头孢克肟", "35.00"),
                true));
        when(pharmacy.statusForRequest(1L, 9101L))
                .thenReturn(RefundPharmacyDirectory.RefundFulfillmentStatus.undispensed("PENDING"));

        PaymentOrderView refundOrder = new PaymentOrderView(
                3001L, 1L, 12L, null, paymentId, "RPO-001",
                "IDEMP-2", "OUTPATIENT", "CASHIER", "WECHAT", "微信支付",
                "REFUND", "SUCCEEDED", new BigDecimal("35.00"), new BigDecimal("35.00"),
                BigDecimal.ZERO, "CNY", "EXT-REF-2", "CORR-2", "CASHIER",
                null, Instant.now(), Instant.now(), null, null, false, List.of());
        when(billing.executeDirectRefund(any(), any())).thenReturn(refundOrder);

        DirectRefundCommand command = new DirectRefundCommand(
                "IDEMP-2", new BigDecimal("35.00"), "患者退费", "CASHIER", List.of(701L));

        PaymentOrderView result = coordinator.directRefund(paymentId, command);

        assertEquals("RPO-001", result.orderNo());
        verify(billing).executeDirectRefund(paymentId, command);
        verify(pharmacy).cancelUnfulfilledForRefund(1L, 9101L);
    }

    private RefundBillingSnapshot snapshot(long encounterId,
                                           RefundChargeSnapshot charge,
                                           boolean unexecutedDirectRefundAllowed) {
        return new RefundBillingSnapshot(
                encounterId, 10L, 1001L, unexecutedDirectRefundAllowed,
                charge.totalAmount(), "CNY", List.of(charge),
                List.of(paymentCandidate(1000L, charge.totalAmount().toPlainString())));
    }

    private RefundChargeSnapshot charge(long id,
                                        String sourceType,
                                        long sourceId,
                                        String itemName,
                                        String totalAmount) {
        return new RefundChargeSnapshot(
                id, sourceType, sourceId, "REQ-" + id, itemName, "ITEM-" + id,
                BigDecimal.ONE, "次", new BigDecimal(totalAmount), false);
    }

    private RefundPaymentCandidateView paymentCandidate(long paymentId, String amount) {
        BigDecimal value = new BigDecimal(amount);
        return new RefundPaymentCandidateView(
                paymentId, "PAY-" + paymentId, "WECHAT", value,
                BigDecimal.ZERO, value, "CNY", Instant.now());
    }
}
