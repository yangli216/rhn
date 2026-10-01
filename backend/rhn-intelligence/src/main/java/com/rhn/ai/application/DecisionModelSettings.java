package com.rhn.ai.application;

import java.net.URI;
import java.time.Duration;
import java.util.Locale;

public record DecisionModelSettings(Mode mode, URI endpoint, String model, String apiKey,
                                    Duration timeout, double minConfidence) {
    public static final String DEFAULT_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
    public static final String DEFAULT_MODEL = "jev-1.13.0";
    public enum Mode { DISABLED, SHADOW, ASSIST }

    public boolean ready() { return endpoint != null && model != null && !model.isBlank()
            && apiKey != null && !apiKey.isBlank(); }

    public static DecisionModelSettings current(ClinicalAiRuntimePolicy policy, Long tenantId) {
        Mode mode;
        try { mode = Mode.valueOf(policy.text(tenantId, "decision-mode", "DISABLED").toUpperCase(Locale.ROOT)); }
        catch (IllegalArgumentException e) { mode = Mode.DISABLED; }
        if (mode == Mode.DISABLED) return new DecisionModelSettings(mode, URI.create(DEFAULT_ENDPOINT),
                DEFAULT_MODEL, null, Duration.ofSeconds(8), 0.9);
        URI endpoint = null;
        try {
            var uri = URI.create(policy.text(tenantId, "decision-endpoint", DEFAULT_ENDPOINT));
            if (uri.getHost() != null && uri.getUserInfo() == null && uri.getFragment() == null
                    && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) endpoint = uri;
        } catch (IllegalArgumentException ignored) { }
        return new DecisionModelSettings(mode, endpoint, policy.text(tenantId, "decision-model", DEFAULT_MODEL),
                policy.secret(tenantId, "decision-api-key", null),
                Duration.ofSeconds(Math.max(1, Math.min(30, policy.number(tenantId, "decision-timeout-seconds", 8)))),
                Math.max(0.5, Math.min(1, policy.number(tenantId, "decision-min-confidence-percent", 90) / 100.0)));
    }
}
