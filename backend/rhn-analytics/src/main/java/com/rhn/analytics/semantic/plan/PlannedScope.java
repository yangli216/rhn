package com.rhn.analytics.semantic.plan;

import com.rhn.analytics.semantic.model.ScopeIntent;

import java.util.Map;

/**
 * 逻辑查询计划中的安全与权限范围规划。
 */
public record PlannedScope(
    ScopeIntent intent,
    Long tenantId,
    Long organizationId,
    Map<Long, String> authorizedDepartments
) {
    public PlannedScope {
        if (intent == null) intent = ScopeIntent.CURRENT;
        authorizedDepartments = authorizedDepartments == null ? Map.of() : Map.copyOf(authorizedDepartments);
    }

    public static PlannedScope defaultDevScope() {
        return new PlannedScope(
            ScopeIntent.AUTHORIZED,
            362387869790209L,
            362387869790211L,
            Map.of(
                362387869799101L, "药学部",
                362387869898501L, "综合病区"
            )
        );
    }
}
