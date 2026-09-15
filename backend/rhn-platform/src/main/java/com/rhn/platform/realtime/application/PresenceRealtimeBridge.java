package com.rhn.platform.realtime.application;

import com.rhn.platform.realtime.api.RealtimeEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Service
public class PresenceRealtimeBridge {
    private final RealtimeConnectionRegistry connections;

    public PresenceRealtimeBridge(RealtimeConnectionRegistry connections) { this.connections = connections; }

    @EventListener
    public void on(PresenceChanged change) {
        Map<String, Object> attributes = new HashMap<>();
        attributes.put("changeType", change.changeType());
        if (change.organizationId() != null) attributes.put("organizationId", change.organizationId().toString());
        if (change.departmentId() != null) attributes.put("departmentId", change.departmentId().toString());
        connections.publish(change.tenantId(), new RealtimeEvent(
                "presence:" + change.occurredAt().toEpochMilli() + ":" + change.changeType(),
                "PRESENCE_SUMMARY_CHANGED", change.occurredAt(), "INFO", null, null, null,
                "Presence", null, "/settings/presence", attributes), "PRESENCE.SUMMARY.READ");
    }
}
