package com.rhn.quality.medication.application;

import com.rhn.platform.masterdata.api.ClinicalSemanticImpactContributor;
import com.rhn.quality.medication.domain.rule.DuplicateMedicationRule;
import com.rhn.quality.medication.infrastructure.MedicationRuleRegistry;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class MedicationRuleImpactService implements ClinicalSemanticImpactContributor {
    private final MedicationRuleRegistry registry;
    public MedicationRuleImpactService(MedicationRuleRegistry registry) { this.registry = registry; }
    @Override
    public Impact describe(String kind, String conceptId) {
        try {
            var versions = registry.load(MedicationSafetyEngine.RULE_SET);
            var references = versions.stream().filter(v -> "MEDICATION".equals(kind)
                            && DuplicateMedicationRule.CODE.equals(v.definition().code()))
                    .map(v -> v.definition().code() + ":" + v.version()).toList();
            return new Impact("RULE_VERSIONS", "FOUNDATION_RULE_SET_ONLY", null, references, !references.isEmpty(),
                    "当前规则按通用药品身份识别重复；成分、剂量与途径规则尚未接入");
        } catch (RuntimeException unavailable) {
            return new Impact("RULE_VERSIONS", "UNAVAILABLE", null, List.of(), true, "规则目录暂不可查询，请保留规则回归检查");
        }
    }
}
