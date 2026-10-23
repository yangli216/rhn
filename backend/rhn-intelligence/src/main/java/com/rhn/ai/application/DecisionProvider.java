package com.rhn.ai.application;

import java.util.Locale;
import static com.rhn.shared.api.BusinessErrors.badRequest;

/** Both providers use the typed System One protocol; credentials remain independent. */
public enum DecisionProvider {
    JEV("Jev", "decision-", "https://api.typesafe.ai/v1/systemone", "jev-1.13.0", "jev"),
    LINGDT("LingDT", "decision-lingdt-", "https://maas-api.antdigital.com/v1/systemone", "lingdt-decision-1.0", "lingdt");

    private final String label;
    private final String prefix;
    private final String endpoint;
    private final String model;
    private final String metricName;

    DecisionProvider(String label, String prefix, String endpoint, String model, String metricName) {
        this.label = label;
        this.prefix = prefix;
        this.endpoint = endpoint;
        this.model = model;
        this.metricName = metricName;
    }
    public String label() { return label; }
    public String settingKey(String suffix) { return prefix + suffix; }
    public String defaultEndpoint() { return endpoint; }
    public String defaultModel() { return model; }
    public String metricName() { return metricName; }

    public static DecisionProvider parse(String value) {
        if (value == null) return JEV;
        try { return valueOf(value.trim().toUpperCase(Locale.ROOT)); }
        catch (IllegalArgumentException e) {
            throw badRequest("DECISION_PROVIDER_INVALID", "不支持的决策模型供应商。");
        }
    }
}
