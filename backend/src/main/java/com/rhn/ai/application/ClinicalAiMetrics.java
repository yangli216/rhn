package com.rhn.ai.application;

import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

import java.time.Duration;

/** Low-cardinality operational metrics for the clinical AI control plane. */
@Component
public final class ClinicalAiMetrics {
    private final MeterRegistry registry;

    public ClinicalAiMetrics(MeterRegistry registry) {
        this.registry = registry;
    }

    public void recordGeneration(String mode, String provider, String outcome, long elapsedNanos) {
        Timer.builder("rhn.ai.clinical.generation")
                .description("Clinical AI suggestion generation latency and outcome")
                .tag("mode", tag(mode)).tag("provider", tag(provider)).tag("outcome", tag(outcome))
                .register(registry).record(Duration.ofNanos(Math.max(0, elapsedNanos)));
    }

    public void recordProviderTokens(String provider, String model, String kind, long tokens) {
        if (tokens < 0) return;
        DistributionSummary.builder("rhn.ai.clinical.tokens")
                .description("Token usage reported by the configured clinical AI provider")
                .baseUnit("tokens").tag("provider", tag(provider)).tag("model", tag(model)).tag("kind", tag(kind))
                .register(registry).record(tokens);
    }

    public void recordSuggestionEvent(String eventType, String outcome) {
        registry.counter("rhn.ai.clinical.suggestion.events", "event", tag(eventType), "outcome", tag(outcome))
                .increment();
    }

    public void recordPlanPreflight(String status, int blockingCount) {
        registry.counter("rhn.ai.clinical.plan.preflight", "status", tag(status)).increment();
        if (blockingCount > 0) {
            registry.counter("rhn.ai.clinical.plan.safety.blocks").increment(blockingCount);
        }
    }

    private static String tag(String value) {
        return value == null || value.isBlank() ? "unknown" : value.trim();
    }
}
