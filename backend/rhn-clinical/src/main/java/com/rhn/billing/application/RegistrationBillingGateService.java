package com.rhn.billing.application;

import com.rhn.billing.domain.RegistrationBillingIntent;
import com.rhn.billing.domain.RegistrationBillingIntentStatus;
import com.rhn.billing.infrastructure.RegistrationBillingIntentRepository;
import com.rhn.outpatient.api.RegistrationBillingGate;
import com.rhn.platform.tenant.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
public class RegistrationBillingGateService implements RegistrationBillingGate {
    private static final List<RegistrationBillingIntentStatus> UNSETTLED_STATUSES = List.of(
            RegistrationBillingIntentStatus.PAYMENT_PENDING, RegistrationBillingIntentStatus.PAID,
            RegistrationBillingIntentStatus.COMPLETING, RegistrationBillingIntentStatus.COMPLETION_FAILED);

    private final RegistrationBillingIntentRepository intents;

    public RegistrationBillingGateService(RegistrationBillingIntentRepository intents) {
        this.intents = intents;
    }

    @Override
    @Transactional(readOnly = true)
    public void requireRegistrationAllowed(Long residentId, Long organizationId, Long departmentId,
                                           Long appointmentId, Long scheduleId, Long slotHoldId) {
        Instant now = Instant.now();
        // 放弃后遗留且已过期的待支付意向无人清理，不再拦截；其余状态不受过期影响。
        List<RegistrationBillingIntent> unsettled = intents
                .findByTenantIdAndResidentIdAndOrganizationIdAndDepartmentIdAndStatusIn(
                        TenantContext.requireTenantId(), residentId, organizationId, departmentId, UNSETTLED_STATUSES)
                .stream().filter(intent -> !abandonedPending(intent, now)).toList();
        if (unsettled.isEmpty()) return;
        // 挂号收费意向完成落库时意向为完成中；只有该意向对应的号源可以继续，其余未完成收费的意向必须先行处理。
        boolean ownCompletion = unsettled.stream().allMatch(intent ->
                intent.status() == RegistrationBillingIntentStatus.COMPLETING && matches(intent, appointmentId, scheduleId, slotHoldId));
        if (!ownCompletion) {
            throw conflict("REGISTRATION_BILLING_UNSETTLED", "该居民已有待完成的挂号收费，请先完成支付或取消原挂号");
        }
    }

    private boolean abandonedPending(RegistrationBillingIntent intent, Instant now) {
        return intent.status() == RegistrationBillingIntentStatus.PAYMENT_PENDING
                && intent.expiresAt() != null && !intent.expiresAt().isAfter(now);
    }

    private boolean matches(RegistrationBillingIntent intent, Long appointmentId, Long scheduleId, Long slotHoldId) {
        if (slotHoldId != null) return slotHoldId.equals(intent.slotHoldId());
        if (appointmentId != null) return appointmentId.equals(intent.appointmentId());
        if (scheduleId != null) return scheduleId.equals(intent.scheduleId());
        return intent.slotHoldId() == null && intent.appointmentId() == null && intent.scheduleId() == null;
    }
}
