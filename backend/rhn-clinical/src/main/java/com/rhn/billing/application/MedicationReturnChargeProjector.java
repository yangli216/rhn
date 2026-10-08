package com.rhn.billing.application;

import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.api.IdempotentDomainEventConsumer;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Projects a verified pharmacy return using the same policy as billing synchronization. */
@Service
public class MedicationReturnChargeProjector {
    private static final String CONSUMER = "billing-medication-return-charge-v1";
    private final MedicationReturnChargeService returns;
    private final IdempotentDomainEventConsumer eventConsumer;

    public MedicationReturnChargeProjector(MedicationReturnChargeService returns, IdempotentDomainEventConsumer eventConsumer) {
        this.returns = returns;
        this.eventConsumer = eventConsumer;
    }

    @EventListener
    @Transactional
    public void project(DomainEventEnvelope event) {
        if (!"MEDICATION_RETURN_POSTED".equals(event.eventType())) return;
        eventConsumer.consume(CONSUMER, event, () -> returns.postEvent(event));
    }
}
