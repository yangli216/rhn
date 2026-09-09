package com.rhn.ai.application;

import com.rhn.shared.context.ExecutionContext;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ClinicalAiGovernanceTest {
    @Test
    void rolloutRequiresConfiguredScopeAndUsesStablePercentageBucket() {
        ClinicalAssistantSettings scoped = settings("10", "20", 100);
        assertTrue(scoped.availableFor(context(10L, 20L, 30L)));
        assertFalse(scoped.availableFor(context(11L, 20L, 30L)));
        assertFalse(scoped.availableFor(context(10L, 21L, 30L)));

        assertFalse(settings("", "", 0).availableFor(context(10L, 20L, 30L)));
        ClinicalAssistantSettings half = settings("", "", 50);
        assertEquals(half.availableFor(context(10L, 20L, 30L)),
                half.availableFor(context(10L, 20L, 30L)), "同一执业人员必须稳定分桶");
        assertThrows(IllegalArgumentException.class, () -> settings("not-an-id", "", 100));
    }

    @Test
    void metricsExposeGenerationTokensEventsAndSafetyBlocksWithoutClinicalIdentifiers() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        ClinicalAiMetrics metrics = new ClinicalAiMetrics(registry);
        metrics.recordGeneration("MODEL", "provider", "SUCCESS", 1_000_000);
        metrics.recordProviderTokens("provider", "model", "total", 42);
        metrics.recordSuggestionEvent("ADOPTED", "RECORDED");
        metrics.recordPlanPreflight("BLOCKED", 2);

        assertEquals(1, registry.get("rhn.ai.clinical.generation").timer().count());
        assertEquals(42, registry.get("rhn.ai.clinical.tokens").summary().totalAmount());
        assertEquals(1, registry.get("rhn.ai.clinical.suggestion.events").counter().count());
        assertEquals(1, registry.get("rhn.ai.clinical.plan.preflight").counter().count());
        assertEquals(2, registry.get("rhn.ai.clinical.plan.safety.blocks").counter().count());
    }

    private ClinicalAssistantSettings settings(String organizations, String departments, int percentage) {
        return new ClinicalAssistantSettings("MODEL", "provider", "model", Duration.ofMinutes(30),
                "http://127.0.0.1/v1/chat/completions", null, Duration.ofSeconds(5), 1200,
                "", "speech", 1024, "", "", 5, organizations, departments, percentage);
    }

    private ExecutionContext context(Long organizationId, Long departmentId, Long practitionerId) {
        return new ExecutionContext(1L, 2L, "doctor", "correlation", Set.of(), organizationId, departmentId,
                "ASSIGNED", Set.of(organizationId), Set.of(departmentId), practitionerId);
    }
}
