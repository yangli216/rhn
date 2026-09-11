package com.rhn.billing.application;

import com.rhn.billing.api.RefundPreCheckViews.RefundItemPreCheckView;
import com.rhn.billing.api.RefundPreCheckViews.RefundPreCheckSummaryView;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.Payment;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.PaymentRepository;
import com.rhn.diagnostics.api.DiagnosticRefundDirectory;
import com.rhn.pharmacy.api.PharmacyRefundDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.treatment.api.TreatmentRefundDirectory;
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
    private PharmacyRefundDirectory pharmacyRefunds;
    private DiagnosticRefundDirectory diagnosticRefunds;
    private TreatmentRefundDirectory treatmentRefunds;
    private RefundPolicy refundPolicy;
    private ExecutionContextProvider contextProvider;

    private RefundPreCheckService service;
    private final ExecutionContext context = new ExecutionContext(1L, 2L, "operator", "corr-1", Set.of());

    @BeforeEach
    void setUp() {
        accounts = mock(PatientAccountRepository.class);
        charges = mock(ChargeItemRepository.class);
        payments = mock(PaymentRepository.class);
        pharmacyRefunds = mock(PharmacyRefundDirectory.class);
        diagnosticRefunds = mock(DiagnosticRefundDirectory.class);
        treatmentRefunds = mock(TreatmentRefundDirectory.class);
        refundPolicy = mock(RefundPolicy.class);
        contextProvider = mock(ExecutionContextProvider.class);

        when(contextProvider.requireCurrent()).thenReturn(context);

        service = new RefundPreCheckService(
                accounts, charges, payments, pharmacyRefunds, diagnosticRefunds,
                treatmentRefunds, refundPolicy, contextProvider
        );
    }

    @Test
    void whenNoAccountFound_shouldReturnBlockedSummary() {
        Long encounterId = 100L;
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(encounterId)))
                .thenReturn(List.of());

        RefundPreCheckSummaryView result = service.preCheck(encounterId);

        assertNotNull(result);
        assertFalse(result.eligibleForRefund());
        assertEquals("BLOCKED", result.overallDecision());
        assertTrue(result.summaryNotice().contains("未检索到该就诊对应的有效费用账户"));
    }

    @Test
    void whenMedicationDispensed_shouldBlockRefund() {
        Long encounterId = 100L;
        PatientAccount account = account(encounterId);
        ChargeItem charge = charge(501L, "MEDICATION_REQUEST", 8001L,
                "REQ-MED-01", "头孢克肟胶囊", "MED001", "35.00", "盒");
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, 10L))
                .thenReturn(List.of(charge));
        when(refundPolicy.isUnexecutedDirectRefundAllowed(any(), any(), any())).thenReturn(true);
        when(pharmacyRefunds.refundFulfillment(1L, 8001L))
                .thenReturn(new PharmacyRefundDirectory.RefundFulfillmentSnapshot("COMPLETED"));

        RefundPreCheckSummaryView result = service.preCheck(encounterId);

        assertNotNull(result);
        assertFalse(result.eligibleForRefund());
        assertEquals("BLOCKED", result.overallDecision());
        assertEquals(1, result.items().size());

        RefundItemPreCheckView item = result.items().get(0);
        assertFalse(item.allowed());
        assertEquals("DISPENSED", item.executionStatusCode());
        assertTrue(item.blockReason().contains("药房已发药出库"));
    }

    @Test
    void whenReportIssued_shouldBlockRefund() {
        Long encounterId = 100L;
        account(encounterId);
        ChargeItem charge = charge(502L, "SERVICE_REQUEST", 8002L,
                "REQ-EXAM-01", "血常规", "EXAM001", "20.00", "次");
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, 10L))
                .thenReturn(List.of(charge));
        when(refundPolicy.isUnexecutedDirectRefundAllowed(any(), any(), any())).thenReturn(true);
        when(diagnosticRefunds.refundExecution(1L, 8002L))
                .thenReturn(new DiagnosticRefundDirectory.RefundExecutionSnapshot(true));

        RefundPreCheckSummaryView result = service.preCheck(encounterId);

        assertNotNull(result);
        assertFalse(result.eligibleForRefund());
        assertEquals("BLOCKED", result.overallDecision());

        RefundItemPreCheckView item = result.items().get(0);
        assertFalse(item.allowed());
        assertEquals("REPORTED", item.executionStatusCode());
        assertTrue(item.blockReason().contains("检验检查已出具诊断报告"));
    }

    @Test
    void whenTreatmentInProgress_shouldBlockRefund() {
        Long encounterId = 100L;
        account(encounterId);
        ChargeItem charge = charge(505L, "TREATMENT", 8005L,
                "REQ-TRT-01", "雾化治疗", "TRT001", "25.00", "次");
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, 10L))
                .thenReturn(List.of(charge));
        when(refundPolicy.isUnexecutedDirectRefundAllowed(any(), any(), any())).thenReturn(true);
        when(treatmentRefunds.refundExecution(1L, 8005L))
                .thenReturn(new TreatmentRefundDirectory.RefundExecutionSnapshot("IN_PROGRESS"));

        RefundPreCheckSummaryView result = service.preCheck(encounterId);

        assertFalse(result.eligibleForRefund());
        assertEquals("EXECUTED", result.items().get(0).executionStatusCode());
        assertTrue(result.items().get(0).blockReason().contains("治疗处置已在执行或已完成"));
    }

    @Test
    void whenUnexecutedAndPolicyEnabled_shouldAllowDirectRefund() {
        Long encounterId = 100L;
        account(encounterId);
        ChargeItem charge = charge(503L, "MEDICATION_REQUEST", 8003L,
                "REQ-MED-03", "感冒清热颗粒", "MED003", "30.00", "盒");
        when(charge.quantity()).thenReturn(new BigDecimal("2"));
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, 10L))
                .thenReturn(List.of(charge));

        when(refundPolicy.isUnexecutedDirectRefundAllowed(any(), any(), any())).thenReturn(true);
        when(pharmacyRefunds.refundFulfillment(1L, 8003L))
                .thenReturn(PharmacyRefundDirectory.RefundFulfillmentSnapshot.notIntake());

        Payment payment = mock(Payment.class);
        when(payment.id()).thenReturn(701L);
        when(payment.paymentNo()).thenReturn("PAY701");
        when(payment.paymentMethodCode()).thenReturn("WECHAT");
        when(payment.paymentType()).thenReturn("PAYMENT");
        when(payment.status()).thenReturn("SUCCEEDED");
        when(payment.amount()).thenReturn(new BigDecimal("30.00"));
        when(payment.currencyCode()).thenReturn("CNY");
        when(payment.paidAt()).thenReturn(Instant.now());

        when(payments.findByTenantIdAndPatientAccountIdOrderByPaidAtAscIdAsc(1L, 10L))
                .thenReturn(List.of(payment));

        RefundPreCheckSummaryView result = service.preCheck(encounterId);

        assertNotNull(result);
        assertTrue(result.eligibleForRefund());
        assertEquals("ALLOWED", result.overallDecision());
        assertEquals(new BigDecimal("30.00"), result.refundableAmount());
        assertEquals(1, result.refundablePayments().size());

        RefundItemPreCheckView item = result.items().get(0);
        assertTrue(item.allowed());
        assertEquals("UNDISPENSED", item.executionStatusCode());
    }

    @Test
    void whenUnexecutedAndPolicyDisabled_shouldBlockAndRequireCancel() {
        Long encounterId = 100L;
        account(encounterId);
        ChargeItem charge = charge(504L, "MEDICATION_REQUEST", 8004L,
                "REQ-MED-04", "阿莫西林", "MED004", "18.00", "盒");
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, 10L))
                .thenReturn(List.of(charge));

        when(refundPolicy.isUnexecutedDirectRefundAllowed(any(), any(), any())).thenReturn(false);
        when(pharmacyRefunds.refundFulfillment(1L, 8004L))
                .thenReturn(PharmacyRefundDirectory.RefundFulfillmentSnapshot.notIntake());

        RefundPreCheckSummaryView result = service.preCheck(encounterId);

        assertNotNull(result);
        assertFalse(result.eligibleForRefund());
        assertEquals("BLOCKED", result.overallDecision());

        RefundItemPreCheckView item = result.items().get(0);
        assertFalse(item.allowed());
        assertEquals("UNDISPENSED_NEED_CANCEL", item.executionStatusCode());
        assertTrue(item.blockReason().contains("需先由开单医生在门诊工作站作废处方"));
    }

    private PatientAccount account(Long encounterId) {
        PatientAccount account = mock(PatientAccount.class);
        when(account.id()).thenReturn(10L);
        when(account.organizationId()).thenReturn(1001L);
        when(account.currencyCode()).thenReturn("CNY");
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(encounterId)))
                .thenReturn(List.of(account));
        return account;
    }

    private ChargeItem charge(Long id, String sourceType, Long sourceId, String requestCode,
                              String itemName, String itemCode, String amount, String unitCode) {
        ChargeItem charge = mock(ChargeItem.class);
        when(charge.id()).thenReturn(id);
        when(charge.sourceType()).thenReturn(sourceType);
        when(charge.sourceId()).thenReturn(sourceId);
        when(charge.requestCode()).thenReturn(requestCode);
        when(charge.itemNameSnapshot()).thenReturn(itemName);
        when(charge.itemCodeSnapshot()).thenReturn(itemCode);
        when(charge.quantity()).thenReturn(BigDecimal.ONE);
        when(charge.unitCode()).thenReturn(unitCode);
        when(charge.totalAmount()).thenReturn(new BigDecimal(amount));
        return charge;
    }
}
