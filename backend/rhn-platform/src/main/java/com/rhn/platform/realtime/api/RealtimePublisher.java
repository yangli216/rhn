package com.rhn.platform.realtime.api;

/** Publishes an event using the existing tenant, authority and work-context filters. */
public interface RealtimePublisher {
    void publish(Long tenantId, RealtimeEvent event, String requiredAuthority);
}
