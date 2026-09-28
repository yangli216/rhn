package com.rhn.ai.application;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Small provider/model circuit breaker that never wraps or blocks non-AI business services. */
@Component
public final class ClinicalAiCircuitBreaker {
    private final int failureThreshold;
    private final Duration openDuration;
    private final Clock clock;
    private final Map<String, State> states = new ConcurrentHashMap<>();

    @Autowired
    public ClinicalAiCircuitBreaker(
            @Value("${rhn.ai.circuit-breaker.failure-threshold:5}") int failureThreshold,
            @Value("${rhn.ai.circuit-breaker.open-duration:PT30S}") Duration openDuration) {
        this(failureThreshold, openDuration, Clock.systemUTC());
    }

    ClinicalAiCircuitBreaker(int failureThreshold, Duration openDuration, Clock clock) {
        this.failureThreshold = Math.max(1, failureThreshold);
        this.openDuration = openDuration == null || openDuration.isNegative() || openDuration.isZero()
                ? Duration.ofSeconds(30) : openDuration;
        this.clock = clock;
    }

    public void beforeRequest(String provider, String model) {
        State state = states.get(key(provider, model));
        if (state == null) return;
        synchronized (state) {
            Instant now = clock.instant();
            if (state.openUntil != null && now.isBefore(state.openUntil)) {
                throw new ClinicalAiModelException(ClinicalAiModelException.Reason.CIRCUIT_OPEN, null,
                        "模型服务熔断中", null);
            }
            if (state.openUntil != null) {
                state.openUntil = null;
                state.consecutiveFailures = 0;
            }
        }
    }

    public void recordSuccess(String provider, String model) {
        states.remove(key(provider, model));
    }

    public void recordFailure(String provider, String model, ClinicalAiModelException.Reason reason) {
        if (!countsTowardCircuit(reason)) return;
        State state = states.computeIfAbsent(key(provider, model), ignored -> new State());
        synchronized (state) {
            state.consecutiveFailures += 1;
            if (state.consecutiveFailures >= failureThreshold) {
                state.openUntil = clock.instant().plus(openDuration);
            }
        }
    }

    private static boolean countsTowardCircuit(ClinicalAiModelException.Reason reason) {
        return reason == ClinicalAiModelException.Reason.AUTHENTICATION
                || reason == ClinicalAiModelException.Reason.RATE_LIMIT
                || reason == ClinicalAiModelException.Reason.PROVIDER_REJECTED
                || reason == ClinicalAiModelException.Reason.TIMEOUT
                || reason == ClinicalAiModelException.Reason.FIRST_VISIBLE_TIMEOUT
                || reason == ClinicalAiModelException.Reason.CONNECTION
                || reason == ClinicalAiModelException.Reason.INVALID_RESPONSE;
    }

    private static String key(String provider, String model) {
        return (provider == null ? "unknown" : provider.trim()) + ":" + (model == null ? "unknown" : model.trim());
    }

    private static final class State {
        private int consecutiveFailures;
        private Instant openUntil;
    }
}
