package com.rhn.analytics.semantic.plan;

import com.rhn.analytics.semantic.model.ScopeIntent;
import java.util.Map;

/** Explicit fixtures for query planning tests; never available to runtime callers. */
final class TestScopes {
    private TestScopes() {}

    static PlannedScope authorized() {
        return new PlannedScope(ScopeIntent.AUTHORIZED, 101L, 201L,
                Map.of(301L, "测试药学部", 302L, "测试病区"));
    }
}
