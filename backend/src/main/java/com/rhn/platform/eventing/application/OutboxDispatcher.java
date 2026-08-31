package com.rhn.platform.eventing.application;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.lang.management.ManagementFactory;

@Service
@ConditionalOnProperty(prefix = "rhn.eventing.outbox", name = "enabled", havingValue = "true", matchIfMissing = true)
public class OutboxDispatcher {
    private final OutboxLeaseService leaseService;
    private final OutboxDeliveryService deliveryService;
    private final String workerId = ManagementFactory.getRuntimeMXBean().getName();

    public OutboxDispatcher(OutboxLeaseService leaseService, OutboxDeliveryService deliveryService) {
        this.leaseService = leaseService;
        this.deliveryService = deliveryService;
    }

    @Scheduled(fixedDelayString = "${rhn.eventing.outbox.poll-interval-ms:1000}")
    public void dispatchPending() {
        for (Long eventId : leaseService.claim(workerId)) deliveryService.deliver(eventId, workerId);
    }
}
