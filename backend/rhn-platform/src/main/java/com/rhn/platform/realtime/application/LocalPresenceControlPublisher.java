package com.rhn.platform.realtime.application;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "rhn.presence.store", havingValue = "memory", matchIfMissing = true)
class LocalPresenceControlPublisher implements PresenceControlPublisher {
    private final ApplicationEventPublisher events;

    LocalPresenceControlPublisher(ApplicationEventPublisher events) { this.events = events; }
    @Override public void publish(PresenceControlCommand command) { events.publishEvent(command); }
}
