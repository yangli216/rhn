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
 * 模板 A：双分类冲突参数化规则（用于相互作用、配伍禁忌、双重 RAS 阻断、双硫仑反应等）。
 * 规则逻辑：当同一处方中同时存在属于 [安全分类 A] 和 [安全分类 B] 的药品时，触发冲突拦截。
 */
public class ParameterizedCategoryConflictRule implements MedicationSafetyRule {
    private final String code;
    private final String implementationKey;
    private final String categoryCodeA;
    private final String categoryCodeB;
    private final String defaultMessageTemplate;
    private final String defaultSuggestion;
    private final JsonCodec json;
    private final MedicationSafetyCategoryMembership safetyCategories;

    public ParameterizedCategoryConflictRule(
            String code,
            String implementationKey,
            String categoryCodeA,
            String categoryCodeB,
            String defaultMessageTemplate,
            String defaultSuggestion,
            JsonCodec json,
            MedicationSafetyCategoryMembership safetyCategories
    ) {
        this.code = Objects.requireNonNull(code, "code");
        this.implementationKey = Objects.requireNonNull(implementationKey, "implementationKey");
        this.categoryCodeA = Objects.requireNonNull(categoryCodeA, "categoryCodeA");
        this.categoryCodeB = Objects.requireNonNull(categoryCodeB, "categoryCodeB");
        this.defaultMessageTemplate = defaultMessageTemplate != null ? defaultMessageTemplate : "处方中【%s】与【%s】存在严重联合用药配伍禁忌或相互作用风险。";
        this.defaultSuggestion = defaultSuggestion != null ? defaultSuggestion : "临床建议避免联合开立，如确需联合使用请遵专科指引并密切监护。";
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
        if (active.size() < 2) {
            return List.of();
        }

        Long tenantId = snapshot.tenantId();
        var matchedItemsA = new ArrayList<PrescriptionSafetySnapshot.MedicationItem>();
        var matchedNamesA = new LinkedHashSet<String>();
        var matchedItemsB = new ArrayList<PrescriptionSafetySnapshot.MedicationItem>();
        var matchedNamesB = new LinkedHashSet<String>();

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
            Long medId = med.hasNonNull("id") ? med.path("id").asLong() : null;

            if (isMember(tenantId, medId, name, categoryCodeA, doseForm)) {
                matchedItemsA.add(item);
                matchedNamesA.add(name);
            }
            if (isMember(tenantId, medId, name, categoryCodeB, doseForm)) {
                matchedItemsB.add(item);
                matchedNamesB.add(name);
            }
        }

        if (!matchedItemsA.isEmpty() && !matchedItemsB.isEmpty()) {
            var allItems = new ArrayList<PrescriptionSafetySnapshot.MedicationItem>(matchedItemsA);
            allItems.addAll(matchedItemsB);
            var requestIds = allItems.stream()
                    .map(PrescriptionSafetySnapshot.MedicationItem::medicationRequestId)
                    .distinct()
                    .toList();

            String message = String.format(defaultMessageTemplate,
                    String.join("、", matchedNamesA),
                    String.join("、", matchedNamesB));

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
