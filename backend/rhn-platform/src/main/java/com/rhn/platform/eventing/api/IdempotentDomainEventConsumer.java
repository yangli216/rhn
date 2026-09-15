package com.rhn.platform.eventing.api;

/** Idempotent event projection boundary for consumers outside the eventing module. */
public interface IdempotentDomainEventConsumer {
    boolean consume(String consumerName, DomainEventEnvelope event, Runnable action);
}
