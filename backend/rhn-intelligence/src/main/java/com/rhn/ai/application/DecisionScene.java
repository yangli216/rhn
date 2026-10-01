package com.rhn.ai.application;

/** Each scene uses the shared provider settings but opts into decision calls separately. */
public enum DecisionScene {
    ASSISTANT_RECOMMENDATIONS("assistant-recommendations", "辅诊建议", "辅诊建议中的院内目录模糊匹配", true),
    PLAN_COMPILATION("plan-compilation", "智能建方", "智能建方中检查检验项目的目录模糊匹配", false);

    private final String key;
    private final String label;
    private final String description;
    private final boolean defaultEnabled;

    DecisionScene(String key, String label, String description, boolean defaultEnabled) {
        this.key = "decision-scene-" + key + "-enabled";
        this.label = label;
        this.description = description;
        this.defaultEnabled = defaultEnabled;
    }
    public String settingKey() { return key; }
    public String label() { return label; }
    public String description() { return description; }
    public boolean defaultEnabled() { return defaultEnabled; }
}
