package com.rhn.billing.application;

import com.rhn.billing.domain.RegistrationBillingIntentStatus;
import com.rhn.billing.infrastructure.RegistrationBillingIntentRepository;
import com.rhn.outpatient.api.RegistrationCancellationGate;
import com.rhn.platform.tenant.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
public class RegistrationCancellationGateService implements RegistrationCancellationGate {
    private final RegistrationBillingIntentRepository intents;

    public RegistrationCancellationGateService(RegistrationBillingIntentRepository intents) {
        this.intents = intents;
    }

    @Override
    @Transactional(readOnly = true)
    public void requireStartAllowed(Long encounterId) {
        intents.findByTenantIdAndEncounterId(TenantContext.requireTenantId(), encounterId)
                .filter(intent -> intent.status() == RegistrationBillingIntentStatus.CANCELLATION_PENDING)
                .ifPresent(intent -> {
                    throw conflict("ENCOUNTER_CANCELLATION_IN_PROGRESS", "该就诊正在办理退号，不能开始接诊");
                });
    }
}
