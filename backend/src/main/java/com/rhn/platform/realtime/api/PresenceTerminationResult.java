package com.rhn.platform.realtime.api;

import java.time.Instant;

public record PresenceTerminationResult(Long userId, int revokedSessions, int affectedConnections,
                                        Instant terminatedAt) {}
