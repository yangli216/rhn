package com.rhn.ai.application;

/** Each scene uses the shared provider settings but opts into decision calls separately. */
public enum DecisionScene {
    RECORD_QUALITY("record-quality", "病历完整性与矛盾提示", "核查病历资料覆盖与文字矛盾，医生核实后修改，不自动补写临床事实", false),
    ASSISTANT_RECOMMENDATIONS("assistant-recommendations", "辅诊建议", "辅诊建议中的院内目录模糊匹配", true),
    PLAN_COMPILATION("plan-compilation", "智能建方", "智能建方中检查检验项目的目录模糊匹配", false),
    OUTPATIENT_TRIAGE("outpatient-triage", "预检分诊辅助", "科室建议与资料补充提示，不决定分级或绿色通道", false),
    CHRONIC_REFILL_ASSESSMENT("chronic-refill-assessment", "慢病复诊评估", "研判复诊患者是否处于稳定期并适合原方续配与安全核查", true);

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
