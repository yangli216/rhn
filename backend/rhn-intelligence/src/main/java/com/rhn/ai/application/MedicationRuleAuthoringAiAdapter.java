package com.rhn.ai.application;

import com.rhn.ai.api.StructuredAiDirectory;
import com.rhn.quality.medication.api.MedicationRuleAuthoringAi;
import org.springframework.stereotype.Service;

@Service
public class MedicationRuleAuthoringAiAdapter implements MedicationRuleAuthoringAi {
    private final StructuredAiDirectory ai;
    public MedicationRuleAuthoringAiAdapter(StructuredAiDirectory ai) { this.ai=ai; }
    public Status status() { var s=ai.status(); return new Status(s.available(), s.model(),
            s.available() ? "真实模型已配置" : "请在 AI助理配置中启用真实模型服务"); }
    public String generate(String systemPrompt, String input) { return ai.complete(systemPrompt, input, "RHN-QMED-AUTHORING-V1"); }
    public String generate(String systemPrompt, String input, String promptVersion) { return ai.complete(systemPrompt, input, promptVersion); }
}
