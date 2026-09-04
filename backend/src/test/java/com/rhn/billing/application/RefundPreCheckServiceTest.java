package com.rhn.billing.application;

import com.rhn.billing.api.RefundPreCheckViews.RefundItemPreCheckView;
import com.rhn.billing.api.RefundPreCheckViews.RefundPreCheckSummaryView;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.Payment;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.PaymentRepository;
import com.rhn.diagnostics.domain.DiagnosticReport;
import com.rhn.diagnostics.infrastructure.DiagnosticReportRepository;
import com.rhn.pharmacy.domain.DispenseTask;
import com.rhn.pharmacy.domain.DispenseTaskLine;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.DispenseTaskRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.treatment.domain.TreatmentExecutionItem;
import com.rhn.treatment.domain.TreatmentExecutionTask;
import com.rhn.treatment.infrastructure.TreatmentExecutionItemRepository;
import com.rhn.treatment.infrastructure.TreatmentExecutionTaskRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RefundPreCheckServiceTest {

    private PatientAccountRepository accounts;
    private ChargeItemRepository charges;
    private PaymentRepository payments;
    private DispenseTaskLineRepository taskLines;
    private DispenseTaskRepository tasks;
    private DiagnosticReportRepository reports;
    private TreatmentExecutionItemRepository treatmentItems;
    private TreatmentExecutionTaskRepository treatmentTasks;
    private RefundPolicy refundPolicy;
    private ExecutionContextProvider contextProvider;

    private RefundPreCheckService service;
    private final ExecutionContext context = new ExecutionContext(1L, 2L, "operator", "corr-1", Set.of());

    @BeforeEach
    void setUp() {
        accounts = mock(PatientAccountRepository.class);
        charges = mock(ChargeItemRepository.class);
        payments = mock(PaymentRepository.class);
        taskLines = mock(DispenseTaskLineRepository.class);
        tasks = mock(DispenseTaskRepository.class);
        reports = mock(DiagnosticReportRepository.class);
        treatmentItems = mock(TreatmentExecutionItemRepository.class);
        treatmentTasks = mock(TreatmentExecutionTaskRepository.class);
        refundPolicy = mock(RefundPolicy.class);
        contextProvider = mock(ExecutionContextProvider.class);

        when(contextProvider.requireCurrent()).thenReturn(context);

        service = new RefundPreCheckService(
                accounts, charges, payments, taskLines, tasks,
                reports, treatmentItems, treatmentTasks, refundPolicy, contextProvider
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
        PatientAccount account = mock(PatientAccount.class);
        when(account.id()).thenReturn(10L);
        when(account.organizationId()).thenReturn(1001L);
        when(account.currencyCode()).thenReturn("CNY");
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(encounterId)))
                .thenReturn(List.of(account));

        ChargeItem charge = mock(ChargeItem.class);
        when(charge.id()).thenReturn(501L);
        when(charge.sourceType()).thenReturn("MEDICATION_REQUEST");
        when(charge.sourceId()).thenReturn(8001L);
        when(charge.requestCode()).thenReturn("REQ-MED-01");
        when(charge.itemNameSnapshot()).thenReturn("头孢克肟胶囊");
        when(charge.itemCodeSnapshot()).thenReturn("MED001");
        when(charge.quantity()).thenReturn(new BigDecimal("1"));
        when(charge.unitCode()).thenReturn("盒");
        when(charge.totalAmount()).thenReturn(new BigDecimal("35.00"));
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, 10L))
                .thenReturn(List.of(charge));

        when(refundPolicy.isUnexecutedDirectRefundAllowed(any(), any(), any())).thenReturn(true);

        DispenseTaskLine taskLine = mock(DispenseTaskLine.class);
        when(taskLine.taskId()).thenReturn(9001L);
        when(taskLines.findByTenantIdAndRequestIdOrderById(1L, 8001L)).thenReturn(List.of(taskLine));

        DispenseTask task = mock(DispenseTask.class);
        when(task.status()).thenReturn("COMPLETED");
        when(tasks.findById(9001L)).thenReturn(Optional.of(task));

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
        PatientAccount account = mock(PatientAccount.class);
        when(account.id()).thenReturn(10L);
        when(account.organizationId()).thenReturn(1001L);
        when(account.currencyCode()).thenReturn("CNY");
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(encounterId)))
                .thenReturn(List.of(account));

        ChargeItem charge = mock(ChargeItem.class);
        when(charge.id()).thenReturn(502L);
        when(charge.sourceType()).thenReturn("SERVICE_REQUEST");
        when(charge.sourceId()).thenReturn(8002L);
        when(charge.requestCode()).thenReturn("REQ-EXAM-01");
        when(charge.itemNameSnapshot()).thenReturn("血常规");
        when(charge.itemCodeSnapshot()).thenReturn("EXAM001");
        when(charge.quantity()).thenReturn(new BigDecimal("1"));
        when(charge.unitCode()).thenReturn("次");
        when(charge.totalAmount()).thenReturn(new BigDecimal("20.00"));
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, 10L))
                .thenReturn(List.of(charge));

        when(refundPolicy.isUnexecutedDirectRefundAllowed(any(), any(), any())).thenReturn(true);

        DiagnosticReport report = mock(DiagnosticReport.class);
        when(reports.findByTenantIdAndRequestIdOrderByReportVersionDesc(1L, 8002L))
                .thenReturn(List.of(report));

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
    void whenUnexecutedAndPolicyEnabled_shouldAllowDirectRefund() {
        Long encounterId = 100L;
        PatientAccount account = mock(PatientAccount.class);
        when(account.id()).thenReturn(10L);
        when(account.organizationId()).thenReturn(1001L);
        when(account.currencyCode()).thenReturn("CNY");
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(encounterId)))
                .thenReturn(List.of(account));

        ChargeItem charge = mock(ChargeItem.class);
        when(charge.id()).thenReturn(503L);
        when(charge.sourceType()).thenReturn("MEDICATION_REQUEST");
        when(charge.sourceId()).thenReturn(8003L);
        when(charge.requestCode()).thenReturn("REQ-MED-03");
        when(charge.itemNameSnapshot()).thenReturn("感冒清热颗粒");
        when(charge.itemCodeSnapshot()).thenReturn("MED003");
        when(charge.quantity()).thenReturn(new BigDecimal("2"));
        when(charge.unitCode()).thenReturn("盒");
        when(charge.totalAmount()).thenReturn(new BigDecimal("30.00"));
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, 10L))
                .thenReturn(List.of(charge));

        // 策略允许直接退款
        when(refundPolicy.isUnexecutedDirectRefundAllowed(any(), any(), any())).thenReturn(true);

        // 未发药
        when(taskLines.findByTenantIdAndRequestIdOrderById(1L, 8003L)).thenReturn(List.of());

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
        PatientAccount account = mock(PatientAccount.class);
        when(account.id()).thenReturn(10L);
        when(account.organizationId()).thenReturn(1001L);
        when(account.currencyCode()).thenReturn("CNY");
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(encounterId)))
                .thenReturn(List.of(account));

        ChargeItem charge = mock(ChargeItem.class);
        when(charge.id()).thenReturn(504L);
        when(charge.sourceType()).thenReturn("MEDICATION_REQUEST");
        when(charge.sourceId()).thenReturn(8004L);
        when(charge.requestCode()).thenReturn("REQ-MED-04");
        when(charge.itemNameSnapshot()).thenReturn("阿莫西林");
        when(charge.itemCodeSnapshot()).thenReturn("MED004");
        when(charge.quantity()).thenReturn(new BigDecimal("1"));
        when(charge.unitCode()).thenReturn("盒");
        when(charge.totalAmount()).thenReturn(new BigDecimal("18.00"));
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, 10L))
                .thenReturn(List.of(charge));

        // 策略关闭直接退款
        when(refundPolicy.isUnexecutedDirectRefundAllowed(any(), any(), any())).thenReturn(false);
        when(taskLines.findByTenantIdAndRequestIdOrderById(1L, 8004L)).thenReturn(List.of());

        RefundPreCheckSummaryView result = service.preCheck(encounterId);

        assertNotNull(result);
        assertFalse(result.eligibleForRefund());
        assertEquals("BLOCKED", result.overallDecision());

        RefundItemPreCheckView item = result.items().get(0);
        assertFalse(item.allowed());
        assertEquals("UNDISPENSED_NEED_CANCEL", item.executionStatusCode());
        assertTrue(item.blockReason().contains("需先由开单医生在门诊工作站作废处方"));
    }
}
