package com.rhn.platform.cryptography.application;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "rhn.crypto.ca", name = "worker-enabled", havingValue = "true", matchIfMissing = true)
class SigningOrderDispatcher {
    private final SigningOrderProcessor processor;
    private final CaProperties properties;

    SigningOrderDispatcher(SigningOrderProcessor processor, CaProperties properties) {
        this.processor = processor;
        this.properties = properties;
    }

    @Scheduled(fixedDelayString = "${rhn.crypto.ca.dispatch-interval-ms:2000}")
    void dispatch() {
        if (properties.enabled()) processor.processDue(properties.dispatchBatchSize());
    }
}
