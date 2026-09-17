package com.rhn.quality.medication.domain.rule;

import tools.jackson.databind.JsonNode;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.quality.medication.domain.MedicationSafetyFinding;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 处方中存在两种及以上全身作用非甾体抗炎药（NSAIDs）的重复用药核查。
 * 联合使用不同 NSAIDs 不会增强解热镇痛效果，反而成倍增加胃肠道穿孔出血及急性肾损伤风险。
 */
public final class NsaidDuplicateRule implements MedicationSafetyRule {
    public static final String CODE = "QMED.NSAID_DUPLICATE";
    public static final String IMPLEMENTATION = "java:nsaid-duplicate:1";

    private static final List<String> NSAID_STEMS = List.of(
            "布洛芬", "双氯芬酸", "塞来昔布", "吲哚美辛", "美洛昔康", "依托考昔",
            "阿司匹林", "洛索洛芬", "萘普生", "酮洛芬", "吡罗昔康", "艾瑞昔布",
            "尼美舒利", "氟比洛芬"
    );

    private static final List<String> TOPICAL_FORMS = List.of(
            "滴眼", "眼膏", "凝胶贴膏", "贴膏", "乳膏", "凝胶剂", "气雾剂", "搽剂", "软膏"
    );

    private final JsonCodec json;

    public NsaidDuplicateRule(JsonCodec json) {
        this.json = json;
    }

    @Override
    public String code() {
        return CODE;
    }

    @Override
    public String implementationKey() {
        return IMPLEMENTATION;
    }

    @Override
    public List<MedicationSafetyFinding> evaluate(PrescriptionSafetySnapshot snapshot, RuleVersion version) {
        var active = snapshot.medications().stream()
                .filter(PrescriptionSafetySnapshot.MedicationItem::activeForEvaluation).toList();
        if (active.size() < 2) {
            return List.of();
        }

        var matchedItems = new ArrayList<PrescriptionSafetySnapshot.MedicationItem>();
        var matchedNames = new LinkedHashSet<String>();

        for (var item : active) {
            if (item.medicationSnapshot() == null || item.medicationSnapshot().isBlank()) {
                continue;
            }
            JsonNode med;
            try {
                med = json.readTree(item.medicationSnapshot());
            } catch (RuntimeException ex) {
                throw new MissingSafetyDataException();
            }

            String name = med.path("name").asText(med.path("medicationName").asText(""));
            String doseForm = med.path("doseForm").asText("");

            if (isSystemicNsaid(name, doseForm)) {
                matchedItems.add(item);
                matchedNames.add(name);
            }
        }

        if (matchedItems.size() >= 2 && matchedNames.size() >= 1) {
            var requestIds = matchedItems.stream().map(PrescriptionSafetySnapshot.MedicationItem::medicationRequestId).toList();
            return List.of(new MedicationSafetyFinding(
                    GlobalIds.next(),
                    version,
                    "处方中包含多种全身性非甾体抗炎药（NSAIDs）【" + String.join("、", matchedNames) + "】联合使用，显著增加消化道溃疡、穿孔及急性肾衰竭风险。",
                    requestIds,
                    "非甾体抗炎药一般不推荐两种或以上同时联合使用，临床疗效不叠加而毒副作用显著增加。建议保留一种或遵临床专科规范调整。"
            ));
        }

        return List.of();
    }

    private boolean isSystemicNsaid(String name, String doseForm) {
        if (name == null || name.isBlank()) return false;
        boolean stemMatch = false;
        for (String stem : NSAID_STEMS) {
            if (name.contains(stem)) {
                stemMatch = true;
                break;
            }
        }
        if (!stemMatch) return false;

        // 排除局部外用制剂
        for (String topical : TOPICAL_FORMS) {
            if (doseForm.contains(topical) || name.contains(topical)) {
                return false;
            }
        }
        return true;
    }
}
