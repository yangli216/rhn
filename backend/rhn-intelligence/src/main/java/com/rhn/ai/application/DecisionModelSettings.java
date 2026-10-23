package com.rhn.ai.application;

import java.net.URI;
import java.time.Duration;
import java.util.Locale;

public record DecisionModelSettings(Mode mode, URI endpoint, String model, String apiKey,
                                    Duration timeout, double minConfidence, DecisionProvider provider) {
    public static final String DEFAULT_ENDPOINT = DecisionProvider.JEV.defaultEndpoint();
    public static final String DEFAULT_MODEL = DecisionProvider.JEV.defaultModel();
    public enum Mode { DISABLED, SHADOW, ASSIST }

    public DecisionModelSettings(Mode mode, URI endpoint, String model, String apiKey,
                                 Duration timeout, double minConfidence) {
        this(mode, endpoint, model, apiKey, timeout, minConfidence, DecisionProvider.JEV);
    }

    public boolean ready() { return endpoint != null && model != null && !model.isBlank()
            && apiKey != null && !apiKey.isBlank(); }

    public static DecisionModelSettings current(ClinicalAiRuntimePolicy policy, Long tenantId) {
        Mode mode;
        try { mode = Mode.valueOf(policy.text(tenantId, "decision-mode", "DISABLED").toUpperCase(Locale.ROOT)); }
        catch (IllegalArgumentException e) { mode = Mode.DISABLED; }
        if (mode == Mode.DISABLED) return new DecisionModelSettings(mode, URI.create(DEFAULT_ENDPOINT),
                DEFAULT_MODEL, null, Duration.ofSeconds(8), 0.9);
        var provider = DecisionProvider.parse(policy.text(tenantId, "decision-provider", "JEV"));
        URI endpoint = null;
        try {
            var uri = URI.create(policy.text(tenantId, provider.settingKey("endpoint"), provider.defaultEndpoint()));
            if (uri.getHost() != null && uri.getUserInfo() == null && uri.getFragment() == null
                    && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) endpoint = uri;
        } catch (IllegalArgumentException ignored) { }
        return new DecisionModelSettings(mode, endpoint, policy.text(tenantId, provider.settingKey("model"), provider.defaultModel()),
                policy.secret(tenantId, provider.settingKey("api-key"), null),
                Duration.ofSeconds(Math.max(1, Math.min(30, policy.number(tenantId, "decision-timeout-seconds", 8)))),
                Math.max(0.5, Math.min(1, policy.number(tenantId, "decision-min-confidence-percent", 90) / 100.0)), provider);
    }
}
