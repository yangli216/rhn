package com.rhn.ai.application;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ClinicalAiCircuitBreakerTest {
    @Test
    void opensAfterConsecutiveProviderFailuresAndSuccessResetsTheCount() {
        var breaker = new ClinicalAiCircuitBreaker(2, Duration.ofMinutes(1), Clock.systemUTC());

        breaker.recordFailure("provider", "model", ClinicalAiModelException.Reason.TIMEOUT);
        assertDoesNotThrow(() -> breaker.beforeRequest("provider", "model"));
        breaker.recordSuccess("provider", "model");
        breaker.recordFailure("provider", "model", ClinicalAiModelException.Reason.CONNECTION);
        assertDoesNotThrow(() -> breaker.beforeRequest("provider", "model"));

        breaker.recordFailure("provider", "model", ClinicalAiModelException.Reason.PROVIDER_REJECTED);
        var error = assertThrows(ClinicalAiModelException.class,
                () -> breaker.beforeRequest("provider", "model"));
        assertEquals(ClinicalAiModelException.Reason.CIRCUIT_OPEN, error.reason());
    }

    @Test
    void clinicalOutputAndCallerInterruptionDoNotOpenTheProviderCircuit() {
        var breaker = new ClinicalAiCircuitBreaker(1, Duration.ofMinutes(1), Clock.systemUTC());
        breaker.recordFailure("provider", "model", ClinicalAiModelException.Reason.OUTPUT_LIMIT);
        breaker.recordFailure("provider", "model", ClinicalAiModelException.Reason.INTERRUPTED);

        assertDoesNotThrow(() -> breaker.beforeRequest("provider", "model"));
    }
}
