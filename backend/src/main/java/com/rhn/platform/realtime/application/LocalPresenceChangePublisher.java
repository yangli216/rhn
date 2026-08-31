package com.rhn.platform.realtime.application;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "rhn.presence.store", havingValue = "memory", matchIfMissing = true)
public class LocalPresenceChangePublisher implements PresenceChangePublisher {
    private final ApplicationEventPublisher events;

    public LocalPresenceChangePublisher(ApplicationEventPublisher events) {
        this.events = events;
    }

    @Override
    public void publish(PresenceChanged change) {
        events.publishEvent(change);
    }
}
