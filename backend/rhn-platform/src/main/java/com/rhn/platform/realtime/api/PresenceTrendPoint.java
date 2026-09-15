package com.rhn.platform.realtime.api;

import java.time.Instant;

public record PresenceTrendPoint(Instant bucketAt, long onlineUsers, long activeUsers,
                                 long onlineContexts, long connections, long instances) {}
