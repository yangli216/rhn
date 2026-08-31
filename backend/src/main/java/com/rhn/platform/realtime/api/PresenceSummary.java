package com.rhn.platform.realtime.api;

import java.time.Instant;
import java.util.List;

public record PresenceSummary(long onlineUsers, long activeUsers, long onlineContexts, long connections,
                              long instances,
                              Instant asOf, List<PresenceScopeSummary> organizations,
                              List<PresenceScopeSummary> departments) {}
