package com.rhn.billing.application;

import com.rhn.billing.domain.RegistrationBillingIntentStatus;
import com.rhn.billing.infrastructure.RegistrationBillingIntentRepository;
import com.rhn.outpatient.api.AppointmentChangeGuard;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
class RegistrationAppointmentChangeGuard implements AppointmentChangeGuard {
    private static final List<RegistrationBillingIntentStatus> ACTIVE = List.of(
            RegistrationBillingIntentStatus.PAYMENT_PENDING, RegistrationBillingIntentStatus.PAID,
            RegistrationBillingIntentStatus.COMPLETING, RegistrationBillingIntentStatus.COMPLETION_FAILED);
    private final RegistrationBillingIntentRepository intents;
    private final RegistrationIntentLifecycle lifecycle;

    RegistrationAppointmentChangeGuard(RegistrationBillingIntentRepository intents, RegistrationIntentLifecycle lifecycle) {
        this.intents = intents; this.lifecycle = lifecycle;
    }

    @Override
    @Transactional
    public boolean registrationInProgress(Long tenantId, Long appointmentId) {
        lifecycle.expireStaleForAppointment(tenantId, appointmentId);
        return intents.findFirstByTenantIdAndAppointmentIdAndStatusIn(tenantId, appointmentId, ACTIVE).isPresent();
    }
}
