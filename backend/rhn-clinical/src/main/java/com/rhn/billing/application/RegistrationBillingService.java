package com.rhn.billing.application;

import com.rhn.billing.api.BillingSceneCompletionHandler;
import com.rhn.billing.api.RegistrationBillingViews.RegistrationIntentView;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.shared.api.BusinessException;
import org.springframework.stereotype.Service;

import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
public class RegistrationBillingService implements BillingSceneCompletionHandler {
    private final RegistrationBillingIntentTransactionService transactions;
    private final EncounterDirectory encounters;
    private final PaymentOrderTransactionService paymentOrders;

    public RegistrationBillingService(RegistrationBillingIntentTransactionService transactions,
                                      EncounterDirectory encounters, PaymentOrderTransactionService paymentOrders) {
        this.transactions = transactions; this.encounters = encounters; this.paymentOrders = paymentOrders;
    }

    public RegistrationIntentView create(CreateRegistrationIntentCommand input) {
        var created = transactions.create(new RegistrationBillingIntentTransactionService.CreateCommand(
                input.residentId(), input.organizationId(), input.departmentId(), input.appointmentId(), input.scheduleId(),
                input.idempotencyCode(), input.registrationSource(), input.visitType(), input.settlementMode(),
                input.coverageId()));
        if (created.zeroFee() && !"COMPLETED".equals(created.view().status())) {
            completePlan(transactions.beginById(created.view().id(), null));
        }
        return transactions.get(created.view().id(), created.view().duplicate());
    }

    public RegistrationIntentView get(Long intentId) { return transactions.get(intentId); }

    public java.util.Map<Long, String> settlementModesByEncounter(java.util.Collection<Long> encounterIds) {
        return transactions.settlementModesByEncounter(encounterIds);
    }

    /** 当前机构／科室选择医保身份挂号时的结算时机：REGISTRATION（挂号时结算）或 VISIT_UNIFIED（诊间统一结算）。 */
    public String insuranceTiming(Long organizationId, Long departmentId) {
        return transactions.insuranceTiming(organizationId, departmentId);
    }

    public RegistrationIntentView cancel(Long intentId) { return transactions.cancel(intentId); }

    public RegistrationIntentView retry(Long intentId) {
        RegistrationIntentView value = transactions.get(intentId);
        Long orderId = value.paymentOrderId();
        boolean deferred = "VISIT_UNIFIED".equals(value.insuranceTiming()) && value.feeAmount().signum() > 0;
        if (value.feeAmount().signum() > 0 && !deferred) {
            if (orderId == null || !"SUCCEEDED".equals(paymentOrders.view(orderId, false).status())) {
                if (value.settlementId() != null && transactions.isSettlementSettled(value.settlementId())) {
                    completePlan(transactions.beginBySettledSettlement(value.settlementId()));
                    return transactions.get(intentId);
                }
                throw conflict("REGISTRATION_PAYMENT_NOT_SUCCEEDED", "挂号费尚未支付成功，不能完成挂号");
            }
        }
        completePlan(transactions.beginById(intentId, orderId));
        return transactions.get(intentId);
    }

    /**
     * 医保资金（含个人账户）已使挂号结算单结清时没有支付指令可触发完成，由医保结算成功后调用本方法建立就诊。
     * 结算单不属于挂号意向或尚未结清时不做任何事。
     */
    public void completeIfSettled(Long settlementId) {
        if (settlementId == null || !transactions.isSettlementSettled(settlementId)) return;
        var plan = transactions.beginBySettledSettlement(settlementId);
        if (plan != null) completePlan(plan);
    }

    @Override
    public boolean supports(String businessScene) { return "REGISTRATION".equals(businessScene); }

    @Override
    public void paymentRequested(PaymentRequested requested) {
        transactions.linkPaymentOrder(requested.settlementId(), requested.paymentOrderId(),
                requested.patientAccountId());
    }

    @Override
    public void complete(PaymentCompletion completion) {
        completePlan(transactions.beginBySettlement(completion.settlementId(), completion.paymentOrderId(),
                completion.patientAccountId()));
    }

    private void completePlan(RegistrationBillingIntentTransactionService.CompletionPlan plan) {
        if (!plan.execute()) return;
        try {
            EncounterDirectory.EncounterSnapshot encounter = encounters.completeRegistration(
                    new EncounterDirectory.RegistrationCompletionCommand(plan.residentId(), plan.organizationId(),
                            plan.departmentId(), plan.appointmentId(), plan.scheduleId(), plan.slotHoldId(), plan.idempotencyCode(),
                            plan.registrationSource(), plan.visitType()));
            transactions.markCompleted(plan.intentId(), encounter.id());
        } catch (RuntimeException exception) {
            String code = exception instanceof BusinessException value ? value.code() : "REGISTRATION_COMPLETION_FAILED";
            transactions.markFailed(plan.intentId(), code, exception.getMessage());
            throw exception;
        }
    }

    public record CreateRegistrationIntentCommand(Long residentId, Long organizationId, Long departmentId,
                                                   Long appointmentId, Long scheduleId, String idempotencyCode,
                                                   String registrationSource, String visitType,
                                                   String settlementMode, Long coverageId) {}
}
