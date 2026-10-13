package com.rhn.quality.medication.domain.rule;

import tools.jackson.databind.JsonNode;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.quality.medication.domain.MedicationSafetyCategoryMembership;
import com.rhn.quality.medication.domain.MedicationSafetyFinding;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

/**
 * 模板 C：分类与聚合数量参数化规则（用于同类重复用药核查，如同类 NSAID 重复、同类 PPI 重复等）。
 * 规则逻辑：当同一处方中属于 [安全分类 X] 的不同药品数量达到或超过设定阈值 N 时，触发重复拦截。
 */
public class ParameterizedCategoryDuplicateRule implements MedicationSafetyRule {
    private final String code;
    private final String implementationKey;
    private final String categoryCode;
    private final int thresholdCount;
    private final String defaultMessageTemplate;
    private final String defaultSuggestion;
    private final JsonCodec json;
    private final MedicationSafetyCategoryMembership safetyCategories;

    public ParameterizedCategoryDuplicateRule(
            String code,
            String implementationKey,
            String categoryCode,
            int thresholdCount,
            String defaultMessageTemplate,
            String defaultSuggestion,
            JsonCodec json,
            MedicationSafetyCategoryMembership safetyCategories
    ) {
        this.code = Objects.requireNonNull(code, "code");
        this.implementationKey = Objects.requireNonNull(implementationKey, "implementationKey");
        this.categoryCode = Objects.requireNonNull(categoryCode, "categoryCode");
        this.thresholdCount = Math.max(2, thresholdCount);
        this.defaultMessageTemplate = defaultMessageTemplate != null ? defaultMessageTemplate : "处方中包含 %d 种及以上同类药品【%s】联合使用，存在潜在同类重复用药风险。";
        this.defaultSuggestion = defaultSuggestion != null ? defaultSuggestion : "同类药效叠加通常不显著增加临床疗效，反而增加毒副反应风险。建议调整保留单一适宜品种。";
        this.json = Objects.requireNonNull(json, "json");
        this.safetyCategories = safetyCategories;
    }

    @Override
    public String code() {
        return code;
    }

    @Override
    public String implementationKey() {
        return implementationKey;
    }

    @Override
    public List<MedicationSafetyFinding> evaluate(PrescriptionSafetySnapshot snapshot, RuleVersion version) {
        var active = snapshot.medications().stream()
                .filter(PrescriptionSafetySnapshot.MedicationItem::activeForEvaluation)
                .toList();
        if (active.size() < thresholdCount) {
            return List.of();
        }

        Long tenantId = snapshot.tenantId();
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

            String name = med.path("name").asString(med.path("medicationName").asString(""));
            String doseForm = med.path("doseForm").asString("");
            Long medId = med.hasNonNull("id") ? med.path("id").asLong() : null;

            if (isMember(tenantId, medId, name, categoryCode, doseForm)) {
                matchedItems.add(item);
                matchedNames.add(name);
            }
        }

        if (matchedItems.size() >= thresholdCount && !matchedNames.isEmpty()) {
            var requestIds = matchedItems.stream()
                    .map(PrescriptionSafetySnapshot.MedicationItem::medicationRequestId)
                    .distinct()
                    .toList();

            String message = String.format(defaultMessageTemplate,
                    matchedItems.size(),
                    String.join("、", matchedNames));

            return List.of(new MedicationSafetyFinding(
                    GlobalIds.next(),
                    version,
                    message,
                    requestIds,
                    defaultSuggestion
            ));
        }

        return List.of();
    }

    private boolean isMember(Long tenantId, Long medId, String name, String categoryCode, String doseForm) {
        if (safetyCategories == null || categoryCode == null || categoryCode.isBlank()) {
            return false;
        }
        return safetyCategories.isMedicationInCategory(tenantId, medId, name, categoryCode, doseForm);
    }
}
