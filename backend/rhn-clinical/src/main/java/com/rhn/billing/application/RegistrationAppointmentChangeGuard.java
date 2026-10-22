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

    RegistrationAppointmentChangeGuard(RegistrationBillingIntentRepository intents) {
        this.intents = intents;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean registrationInProgress(Long tenantId, Long appointmentId) {
        return intents.findFirstByTenantIdAndAppointmentIdAndStatusIn(tenantId, appointmentId, ACTIVE).isPresent();
    }
}
