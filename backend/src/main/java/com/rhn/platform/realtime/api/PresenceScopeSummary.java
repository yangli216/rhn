package com.rhn.platform.realtime.api;

public record PresenceScopeSummary(String scopeType, Long organizationId, Long departmentId, String name,
                                   long onlineUsers, long activeUsers, long onlineContexts, long connections) {}
