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
                input.residentId(), input.organizationId(), input.departmentId(), input.scheduleId(),
                input.idempotencyCode(), input.registrationSource(), input.visitType()));
        if (created.zeroFee() && !"COMPLETED".equals(created.view().status())) {
            completePlan(transactions.beginById(created.view().id(), null));
        }
        return transactions.get(created.view().id(), created.view().duplicate());
    }

    public RegistrationIntentView get(Long intentId) { return transactions.get(intentId); }

    public RegistrationIntentView cancel(Long intentId) { return transactions.cancel(intentId); }

    public RegistrationIntentView retry(Long intentId) {
        RegistrationIntentView value = transactions.get(intentId);
        Long orderId = value.paymentOrderId();
        if (value.feeAmount().signum() > 0) {
            if (orderId == null || !"SUCCEEDED".equals(paymentOrders.view(orderId, false).status())) {
                throw conflict("REGISTRATION_PAYMENT_NOT_SUCCEEDED", "挂号费尚未支付成功，不能完成挂号");
            }
        }
        completePlan(transactions.beginById(intentId, orderId));
        return transactions.get(intentId);
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
                            plan.departmentId(), plan.scheduleId(), plan.slotHoldId(), plan.idempotencyCode(),
                            plan.registrationSource(), plan.visitType()));
            transactions.markCompleted(plan.intentId(), encounter.id());
        } catch (RuntimeException exception) {
            String code = exception instanceof BusinessException value ? value.code() : "REGISTRATION_COMPLETION_FAILED";
            transactions.markFailed(plan.intentId(), code, exception.getMessage());
            throw exception;
        }
    }

    public record CreateRegistrationIntentCommand(Long residentId, Long organizationId, Long departmentId,
                                                   Long scheduleId, String idempotencyCode,
                                                   String registrationSource, String visitType) {}
}
