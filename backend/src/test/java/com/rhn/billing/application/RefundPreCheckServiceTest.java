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
import com.rhn.outpatient.api.EncounterDirectory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verifyNoInteractions;
import com.rhn.shared.api.BusinessException;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
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
    private EncounterDirectory encounterDirectory;
    private ExecutionContextProvider contextProvider;

    private RefundPreCheckService service;
    private final ExecutionContext context = new ExecutionContext(1L, 2L, "operator", "corr-1", Set.of(), 1001L, 1002L, "ORGANIZATION", Set.of(1001L), Set.of(1002L));

    @BeforeEach
    void setUp() {
        accounts = mock(PatientAccountRepository.class);
        charges = mock(ChargeItemRepository.class);
        payments = mock(PaymentRepository.class);
        pharmacy = mock(RefundPharmacyDirectory.class);
        diagnostics = mock(RefundDiagnosticDirectory.class);
        treatment = mock(RefundTreatmentDirectory.class);
        refundPolicy = mock(RefundPolicy.class);
        encounterDirectory = mock(EncounterDirectory.class);
        contextProvider = mock(ExecutionContextProvider.class);
        when(contextProvider.requireCurrent()).thenReturn(context);
        service = new RefundPreCheckService(
                accounts, charges, payments, pharmacy, diagnostics, treatment, refundPolicy, encounterDirectory, contextProvider);
    }

    @Test
    void whenNoAccountFound_shouldStillVerifyEncounterChargesWithoutBlockingOnAccount() {
        Long encounterId = 100L;
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(encounterId))).thenReturn(List.of());
        when(charges.findByTenantIdAndEncounterIdOrderByOccurredAtAscIdAsc(1L, encounterId)).thenReturn(List.of());

        RefundPreCheckSummaryView result = service.preCheck(encounterId);

        assertNotNull(result);
        assertFalse(result.eligibleForRefund());
        assertEquals("BLOCKED", result.overallDecision());
        assertTrue(result.summaryNotice().contains("暂无可退费的收费项目"));
        assertNull(result.accountId());
    }

    @Test
    void aggregates_charges_and_payments_across_all_accounts_of_the_encounter() {
        Long encounterId = 100L;
        PatientAccount first = account(encounterId, 10L);
        PatientAccount second = account(encounterId, 11L);
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(encounterId))).thenReturn(List.of(first, second));
        ChargeItem firstCharge = charge(505L, "OTHER", 1L, "项目一", "10.00");
        ChargeItem secondCharge = charge(506L, "OTHER", 2L, "项目二", "20.00");
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, 10L)).thenReturn(List.of(firstCharge));
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, 11L)).thenReturn(List.of(secondCharge));

        RefundPreCheckSummaryView result = service.preCheck(encounterId);

        assertTrue(result.eligibleForRefund());
        assertEquals(2, result.items().size());
        assertEquals(new BigDecimal("30.00"), result.refundableAmount());
        assertNull(result.accountId());
    }

    @Test
    void charges_by_encounter_are_checked_without_any_patient_account() {
        Long encounterId = 100L;
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(encounterId))).thenReturn(List.of());
        ChargeItem charge = charge(507L, "OTHER", 3L, "项目三", "15.00");
        when(charges.findByTenantIdAndEncounterIdOrderByOccurredAtAscIdAsc(1L, encounterId)).thenReturn(List.of(charge));

        RefundPreCheckSummaryView result = service.preCheck(encounterId);

        assertTrue(result.eligibleForRefund());
        assertEquals(1, result.items().size());
        assertNull(result.accountId());
    }

    @Test
    void resolves_encounter_from_the_payment_account_when_encounter_is_absent() {
        PatientAccount account = account(100L, 10L);
        when(accounts.findByIdAndTenantId(10L, 1L)).thenReturn(java.util.Optional.of(account));
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(100L))).thenReturn(List.of(account));
        ChargeItem charge = charge(508L, "OTHER", 4L, "项目四", "5.00");
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, 10L))
                .thenReturn(List.of(charge));

        RefundPreCheckSummaryView result = service.preCheck(null, 10L);

        assertEquals(100L, result.encounterId());
        assertEquals(10L, result.accountId());
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

    @Test
    void rejects_foreign_organization_before_loading_clinical_or_payment_details() {
        var foreign = account(100L, 10L);
        when(foreign.organizationId()).thenReturn(2001L);
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(100L))).thenReturn(List.of(foreign));
        assertEquals("BILLING_ACCOUNT_SCOPE_INVALID", assertThrows(BusinessException.class,
                () -> service.preCheck(100L)).code());
        verifyNoInteractions(charges, payments, pharmacy, diagnostics, treatment, refundPolicy);
    }

    @Test
    void rejects_an_account_that_belongs_to_another_encounter() {
        PatientAccount otherVisit = account(200L, 10L);
        when(accounts.findByIdAndTenantId(10L, 1L)).thenReturn(java.util.Optional.of(otherVisit));
        assertEquals("BILLING_ACCOUNT_ENCOUNTER_MISMATCH", assertThrows(BusinessException.class,
                () -> service.preCheck(100L, 10L)).code());
        verifyNoInteractions(charges, payments, pharmacy, diagnostics, treatment, refundPolicy);
    }

    @Test
    void rejects_an_explicit_account_from_an_inaccessible_organization() {
        PatientAccount foreign = account(100L, 10L);
        when(foreign.organizationId()).thenReturn(2001L);
        when(accounts.findByIdAndTenantId(10L, 1L)).thenReturn(java.util.Optional.of(foreign));
        assertEquals("BILLING_ACCOUNT_SCOPE_INVALID", assertThrows(BusinessException.class,
                () -> service.preCheck(100L, 10L)).code());
        verifyNoInteractions(charges, payments, pharmacy, diagnostics, treatment, refundPolicy);
    }

    @Test
    void rejects_an_unknown_explicit_account() {
        when(accounts.findByIdAndTenantId(10L, 1L)).thenReturn(java.util.Optional.empty());
        assertEquals("PATIENT_ACCOUNT_NOT_FOUND", assertThrows(BusinessException.class,
                () -> service.preCheck(100L, 10L)).code());
        verifyNoInteractions(charges, payments);
    }

    @Test
    void requires_a_selected_work_context_before_querying_accounts() {
        when(contextProvider.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "operator", "corr", Set.of()));
        assertEquals("BILLING_WORK_CONTEXT_REQUIRED", assertThrows(BusinessException.class,
                () -> service.preCheck(100L)).code());
        verifyNoInteractions(accounts, charges, payments);
    }

    @Test
    void accepts_an_explicitly_accessible_organization() {
        when(contextProvider.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "operator", "corr",
                Set.of(), 2001L, 2002L, "ORGANIZATION", Set.of(1001L), Set.of()));
        whenUnexecutedAndPolicyEnabled_shouldAllowDirectRefund();
    }

    private void registrationScenario(String encounterStatus, ChargeItem... extra) {
        PatientAccount account = account(100L, 10L);
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(100L))).thenReturn(List.of(account));
        ChargeItem reg = charge(600L, "REGISTRATION", 9000L, "普通门诊挂号费", "5.00");
        when(reg.encounterId()).thenReturn(100L);
        List<ChargeItem> all = new java.util.ArrayList<>(List.of(reg));
        all.addAll(List.of(extra));
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, 10L)).thenReturn(all);
        when(refundPolicy.isUnexecutedDirectRefundAllowed(any(), any(), any())).thenReturn(true);
        EncounterDirectory.EncounterSnapshot snapshot = new EncounterDirectory.EncounterSnapshot(
                100L, 1L, 5L, 1001L, 1L, "E100", "c1", encounterStatus, 0L, "内科", Instant.now());
        when(encounterDirectory.findOrganizationAccessible(List.of(100L))).thenReturn(List.of(snapshot));
    }

    @Test
    void registration_fee_of_unvisited_encounter_is_blocked_and_directs_to_withdrawal() {
        registrationScenario("REGISTERED");
        RefundPreCheckSummaryView result = service.preCheck(100L);
        RefundItemPreCheckView item = result.items().get(0);
        assertFalse(item.allowed());
        assertEquals("REGISTRATION_WITHDRAW", item.executionStatusCode());
        assertEquals("BLOCKED", result.overallDecision());
        assertEquals("当前就诊仅有挂号费，挂号费请走退号流程。", result.summaryNotice());
        assertFalse(result.eligibleForRefund());
    }

    @Test
    void registration_fee_of_visited_encounter_is_not_refundable() {
        registrationScenario("IN_PROGRESS");
        RefundItemPreCheckView item = service.preCheck(100L).items().get(0);
        assertFalse(item.allowed());
        assertEquals("REGISTRATION_IN_SERVICE", item.executionStatusCode());
    }

    @Test
    void registration_fee_does_not_turn_refundable_orders_into_partial() {
        ChargeItem med = charge(601L, "MEDICATION_REQUEST", 8101L, "感冒清热颗粒", "30.00");
        registrationScenario("IN_PROGRESS", med);
        when(pharmacy.statusForRequest(1L, 8101L)).thenReturn(RefundPharmacyDirectory.RefundFulfillmentStatus.undispensed("PENDING"));
        RefundPreCheckSummaryView result = service.preCheck(100L);
        assertEquals("ALLOWED", result.overallDecision());
        assertEquals(2, result.items().size());
        assertEquals(new BigDecimal("30.00"), result.refundableAmount());
        assertTrue(result.eligibleForRefund());
        assertEquals("医嘱费用均可直接退费；挂号费不在此退还。", result.summaryNotice());
    }

    private void treatmentScenario(ChargeItem charge) {
        PatientAccount account = account(100L, 10L);
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(100L))).thenReturn(List.of(account));
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, 10L)).thenReturn(List.of(charge));
        when(refundPolicy.isUnexecutedDirectRefundAllowed(any(), any(), any())).thenReturn(true);
    }

    @Test
    void treatment_service_already_started_blocks_refund_and_points_to_the_treatment_department() {
        treatmentScenario(charge(801L, "SERVICE_REQUEST", 9001L, "静脉输液治疗", "40.00"));
        when(treatment.isExecutedOrInProgress(1L, "SERVICE_REQUEST", 9001L)).thenReturn(true);

        RefundPreCheckSummaryView result = service.preCheck(100L);

        assertFalse(result.eligibleForRefund());
        assertEquals("BLOCKED", result.overallDecision());
        RefundItemPreCheckView item = result.items().get(0);
        assertFalse(item.allowed());
        assertEquals("EXECUTED", item.executionStatusCode());
        assertEquals("已执行 · 阻断", item.statusBadgeText());
        assertTrue(item.blockReason().contains("治疗科室"));
        assertEquals(BigDecimal.ZERO, result.refundableAmount());
    }

    @Test
    void treatment_service_not_started_is_still_refundable() {
        treatmentScenario(charge(802L, "SERVICE_REQUEST", 9002L, "雾化治疗", "25.00"));
        when(treatment.isExecutedOrInProgress(1L, "SERVICE_REQUEST", 9002L)).thenReturn(false);

        RefundPreCheckSummaryView result = service.preCheck(100L);

        assertTrue(result.eligibleForRefund());
        assertEquals("ALLOWED", result.overallDecision());
        assertEquals("UNEXECUTED", result.items().get(0).executionStatusCode());
        assertEquals(new BigDecimal("25.00"), result.refundableAmount());
    }

    @Test
    void diagnostics_report_block_keeps_priority_over_the_treatment_lookup() {
        treatmentScenario(charge(803L, "SERVICE_REQUEST", 9003L, "检查加治疗", "30.00"));
        when(diagnostics.hasReportForRequest(1L, 9003L)).thenReturn(true);

        RefundPreCheckSummaryView result = service.preCheck(100L);

        assertEquals("REPORTED", result.items().get(0).executionStatusCode());
        verifyNoInteractions(treatment);
    }

    @Test
    void injected_medication_not_dispensed_but_treatment_started_is_blocked() {
        treatmentScenario(charge(804L, "MEDICATION_REQUEST", 9004L, "头孢曲松针", "18.00"));
        when(pharmacy.statusForRequest(1L, 9004L)).thenReturn(RefundPharmacyDirectory.RefundFulfillmentStatus.undispensed("PENDING"));
        when(treatment.isExecutedOrInProgress(1L, "MEDICATION_REQUEST", 9004L)).thenReturn(true);

        RefundItemPreCheckView item = service.preCheck(100L).items().get(0);

        assertFalse(item.allowed());
        assertEquals("EXECUTED", item.executionStatusCode());
        assertEquals("已执行 · 阻断", item.statusBadgeText());
    }

    @Test
    void injected_medication_not_dispensed_and_not_started_is_refundable() {
        treatmentScenario(charge(805L, "MEDICATION_REQUEST", 9005L, "头孢曲松针", "18.00"));
        when(pharmacy.statusForRequest(1L, 9005L)).thenReturn(RefundPharmacyDirectory.RefundFulfillmentStatus.undispensed("PENDING"));
        when(treatment.isExecutedOrInProgress(1L, "MEDICATION_REQUEST", 9005L)).thenReturn(false);

        RefundItemPreCheckView item = service.preCheck(100L).items().get(0);

        assertTrue(item.allowed());
        assertEquals("UNDISPENSED", item.executionStatusCode());
    }

    @Test
    void dispensed_block_keeps_priority_over_the_treatment_lookup() {
        treatmentScenario(charge(806L, "MEDICATION_REQUEST", 9006L, "头孢曲松针", "18.00"));
        when(pharmacy.statusForRequest(1L, 9006L))
                .thenReturn(new RefundPharmacyDirectory.RefundFulfillmentStatus("DISPENSED", "COMPLETED"));
        when(treatment.isExecutedOrInProgress(1L, "MEDICATION_REQUEST", 9006L)).thenReturn(true);

        RefundItemPreCheckView item = service.preCheck(100L).items().get(0);

        assertEquals("DISPENSED", item.executionStatusCode());
        assertEquals("已发药 · 阻断(需药房退药)", item.statusBadgeText());
    }

    @Test
    void legacy_treatment_source_type_is_no_longer_a_dead_branch() {
        treatmentScenario(charge(807L, "TREATMENT", 9007L, "未知来源", "10.00"));

        RefundItemPreCheckView item = service.preCheck(100L).items().get(0);

        assertEquals("OTHER", item.executionStatusCode());
        verifyNoInteractions(treatment);
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
