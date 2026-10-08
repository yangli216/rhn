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

}
