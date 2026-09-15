package com.rhn.platform.realtime.api;

import java.time.Instant;
import java.util.List;

public record PresenceTrend(String scopeType, Long organizationId, Long departmentId,
                            Instant from, Instant to, List<PresenceTrendPoint> points) {}
