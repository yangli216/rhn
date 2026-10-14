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
 * 模板 B：分类与人群/事实条件参数化规则（用于特定年龄、特殊人群禁忌，如儿童禁用喹诺酮、老年人慎用苯二氮䓬等）。
 * 规则逻辑：当患者年龄低于 minAge（或高于 maxAge），且处方中开立了属于 [安全分类 X] 的药品时触发拦截。
 */
public class ParameterizedCategoryPopulationRule implements MedicationSafetyRule {
    private final String code;
    private final String implementationKey;
    private final String categoryCode;
    private final String targetGender;
    private final Integer rangeMinAge;
    private final Integer rangeMaxAge;
    private final Integer minAgeExclusive; // 例如 < 18 岁
    private final Integer maxAgeInclusive; // 例如 >= 65 岁
    private final boolean treatUnknownAgeAsMatch;
    private final String defaultMessageTemplate;
    private final String defaultSuggestion;
    private final JsonCodec json;
    private final MedicationSafetyCategoryMembership safetyCategories;

    public ParameterizedCategoryPopulationRule(
            String code,
            String implementationKey,
            String categoryCode,
            Integer minAgeExclusive,
            Integer maxAgeInclusive,
            String defaultMessageTemplate,
            String defaultSuggestion,
            JsonCodec json,
            MedicationSafetyCategoryMembership safetyCategories
    ) {
        this(code, implementationKey, categoryCode, null, null, null,
                minAgeExclusive, maxAgeInclusive, false,
                defaultMessageTemplate, defaultSuggestion, json, safetyCategories);
    }

    public ParameterizedCategoryPopulationRule(
            String code,
            String implementationKey,
            String categoryCode,
            String targetGender,
            Integer rangeMinAge,
            Integer rangeMaxAge,
            Integer minAgeExclusive,
            Integer maxAgeInclusive,
            boolean treatUnknownAgeAsMatch,
            String defaultMessageTemplate,
            String defaultSuggestion,
            JsonCodec json,
            MedicationSafetyCategoryMembership safetyCategories
    ) {
        this.code = Objects.requireNonNull(code, "code");
        this.implementationKey = Objects.requireNonNull(implementationKey, "implementationKey");
        this.categoryCode = Objects.requireNonNull(categoryCode, "categoryCode");
        this.targetGender = targetGender;
        this.rangeMinAge = rangeMinAge;
        this.rangeMaxAge = rangeMaxAge;
        this.minAgeExclusive = minAgeExclusive;
        this.maxAgeInclusive = maxAgeInclusive;
        this.treatUnknownAgeAsMatch = treatUnknownAgeAsMatch;
        this.defaultMessageTemplate = defaultMessageTemplate != null ? defaultMessageTemplate : "患者人群特征属于特定风险人群，禁忌/慎用【%s】。";
        this.defaultSuggestion = defaultSuggestion != null ? defaultSuggestion : "请严格遵照药品说明书与权威临床指南的人群用药规范，选用适宜替代药品。";
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
        var context = snapshot.patientContext();
        if (context == null) {
            return List.of();
        }

        if (targetGender != null && !targetGender.isBlank()) {
            if (!matchesGender(context.gender(), targetGender)) {
                return List.of();
            }
        }

        Integer age = context.patientAgeYears();
        boolean hasAgeCondition = (minAgeExclusive != null || maxAgeInclusive != null || rangeMinAge != null || rangeMaxAge != null);
        if (hasAgeCondition) {
            if (age == null) {
                if (!treatUnknownAgeAsMatch) {
                    return List.of();
                }
            } else {
                boolean ageMatched = false;
                if (minAgeExclusive != null && age < minAgeExclusive) {
                    ageMatched = true;
                }
                if (maxAgeInclusive != null && age >= maxAgeInclusive) {
                    ageMatched = true;
                }
                if (rangeMinAge != null && rangeMaxAge != null) {
                    if (age >= rangeMinAge && age <= rangeMaxAge) {
                        ageMatched = true;
                    }
                } else if (rangeMinAge != null && age >= rangeMinAge) {
                    ageMatched = true;
                } else if (rangeMaxAge != null && age <= rangeMaxAge) {
                    ageMatched = true;
                }

                if (!ageMatched) {
                    return List.of();
                }
            }
        }

        var active = snapshot.medications().stream()
                .filter(PrescriptionSafetySnapshot.MedicationItem::activeForEvaluation)
                .toList();
        if (active.isEmpty()) {
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

        if (!matchedItems.isEmpty()) {
            var requestIds = matchedItems.stream()
                    .map(PrescriptionSafetySnapshot.MedicationItem::medicationRequestId)
                    .distinct()
                    .toList();

            String joinedNames = String.join("、", matchedNames);
            String message;
            if (age != null) {
                try {
                    message = String.format(defaultMessageTemplate, age, joinedNames);
                } catch (Exception ex) {
                    message = String.format(defaultMessageTemplate, String.valueOf(age), joinedNames);
                }
            } else {
                try {
                    message = String.format(defaultMessageTemplate, "未知", joinedNames);
                } catch (Exception ex) {
                    message = String.format(defaultMessageTemplate, joinedNames);
                }
            }

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

    private boolean matchesGender(String patientGender, String target) {
        if (target == null || target.isBlank()) {
            return true;
        }
        if (patientGender == null || patientGender.isBlank() || "0".equals(patientGender) || "9".equals(patientGender)) {
            return false;
        }
        boolean targetIsFemale = isFemale(target);
        boolean patientIsFemale = isFemale(patientGender);
        return targetIsFemale == patientIsFemale;
    }

    private static boolean isFemale(String gender) {
        if (gender == null) return false;
        String trimmed = gender.trim();
        return "2".equalsIgnoreCase(trimmed)
                || "F".equalsIgnoreCase(trimmed)
                || "女".equals(trimmed)
                || "女性".equals(trimmed);
    }

    private boolean isMember(Long tenantId, Long medId, String name, String categoryCode, String doseForm) {
        if (safetyCategories == null || categoryCode == null || categoryCode.isBlank()) {
            return false;
        }
        return safetyCategories.isMedicationInCategory(tenantId, medId, name, categoryCode, doseForm);
    }
}
