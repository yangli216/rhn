package com.rhn.platform.realtime.application;

import java.time.Instant;
import java.util.Set;

public record PresenceControlCommand(Long tenantId, Long userId, Set<String> clientSessionIds,
                                     String reason, Long actorId, Instant occurredAt) {
    public PresenceControlCommand {
        clientSessionIds = clientSessionIds == null ? Set.of() : Set.copyOf(clientSessionIds);
    }
}
