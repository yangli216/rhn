package com.rhn.quality.medication.domain.rule;

import tools.jackson.databind.JsonNode;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.quality.medication.domain.MedicationSafetyCategoryMembership;
import com.rhn.quality.medication.domain.MedicationSafetyFinding;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import java.util.ArrayList;
import java.util.List;

/**
 * 儿童及特定年龄禁忌用药核查。
 * 1. 18周岁以下儿童青少年禁用氟喹诺酮类抗菌药（软骨损害高危风险）；
 * 2. 12周岁以下儿童禁用阿司匹林进行解热镇痛（瑞氏综合征 Reye's syndrome 致命风险）；
 * 3. 8周岁以下儿童骨骼牙齿发育期禁用四环素类抗菌药（四环素牙永久黄染与骨发育抑制风险）；
 * 4. 6周岁以下儿童及婴幼儿禁用氨基糖苷类抗生素（不可逆药物性耳聋与急性肾毒性高危风险）。
 */
public final class AgeContraindicationRule implements MedicationSafetyRule {
    public static final String CODE = "QMED.AGE_CONTRAINDICATION";
    public static final String IMPLEMENTATION = "java:age-contraindication:1";

    public static final String CAT_QUINOLONE = "QUINOLONE_PEDIATRIC_CONTRA";
    public static final String CAT_ASPIRIN = "ASPIRIN_PEDIATRIC_CONTRA";
    public static final String CAT_TETRACYCLINE = "TETRACYCLINE_PEDIATRIC_CONTRA";
    public static final String CAT_AMINOGLYCOSIDE = "AMINOGLYCOSIDE_PEDIATRIC_CONTRA";

    // 经典兜底基线（当租户尚未完成分类维护时平滑回退，保障基线安全）
    private static final List<String> FALLBACK_QUINOLONES = List.of(
            "诺氟沙星", "左氧氟沙星", "环丙沙星", "莫西沙星", "氧氟沙星",
            "依诺沙星", "氟罗沙星", "洛美沙星", "加替沙星", "托氟沙星", "司帕沙星"
    );

    private static final List<String> FALLBACK_TETRACYCLINES = List.of(
            "多西环素", "米诺环素", "四环素", "土霉素", "金霉素", "地美环素"
    );

    private static final List<String> FALLBACK_AMINOGLYCOSIDES = List.of(
            "阿米卡星", "庆大霉素", "妥布霉素", "链霉素", "奈替米星", "依替米星", "大观霉素", "新霉素", "卡那霉素"
    );

    private static final List<String> TOPICAL_FORMS = List.of(
            "滴眼", "眼膏", "滴耳", "滴鼻", "凝胶", "乳膏", "软膏"
    );

    private final JsonCodec json;
    private final MedicationSafetyCategoryMembership safetyCategories;

    public AgeContraindicationRule(JsonCodec json) {
        this(json, null);
    }

    public AgeContraindicationRule(JsonCodec json, MedicationSafetyCategoryMembership safetyCategories) {
        this.json = json;
        this.safetyCategories = safetyCategories;
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
        var context = snapshot.patientContext();
        if (context == null || context.patientAgeYears() == null) {
            return List.of();
        }
        int age = context.patientAgeYears();

        var active = snapshot.medications().stream()
                .filter(PrescriptionSafetySnapshot.MedicationItem::activeForEvaluation).toList();
        if (active.isEmpty()) {
            return List.of();
        }

        var findings = new ArrayList<MedicationSafetyFinding>();
        Long tenantId = snapshot.tenantId();

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

            // 1. 18岁以下禁用全身性氟喹诺酮类
            if (age < 18 && isSystemicQuinolone(tenantId, medId, name, doseForm)) {
                findings.add(new MedicationSafetyFinding(
                        GlobalIds.next(),
                        version,
                        "患者年龄（" + age + "岁）未满18周岁，禁用氟喹诺酮类抗菌药物【" + name + "】（骨骼生长发育期关节软骨损伤风险）。",
                        List.of(item.medicationRequestId()),
                        "18周岁以下骨骼处于生长发育期的儿童及青少年禁用氟喹诺酮类药物。请更换为儿童适用的β-内酰胺类（青霉素类/头孢菌素类）或大环内酯类抗菌药。"
                ));
            }

            // 2. 12岁以下禁用阿司匹林解热镇痛（瑞氏综合征风险）
            if (age < 12 && isAspirin(tenantId, medId, name, doseForm)) {
                findings.add(new MedicationSafetyFinding(
                        GlobalIds.next(),
                        version,
                        "患者年龄（" + age + "岁）不满12周岁，开立【" + name + "】存在诱发严重瑞氏综合征（Reye综合征）风险。",
                        List.of(item.medicationRequestId()),
                        "12岁以下儿童病毒性感冒发热禁用阿司匹林解热镇痛。退热建议更换为儿童适用的布洛芬或对乙酰氨基酚。"
                ));
            }

            // 3. 8岁以下禁用四环素类抗生素（牙齿黄染及骨发育损害风险）
            if (age < 8 && isSystemicTetracycline(tenantId, medId, name, doseForm)) {
                findings.add(new MedicationSafetyFinding(
                        GlobalIds.next(),
                        version,
                        "患者年龄（" + age + "岁）未满8周岁，禁用四环素类抗生素【" + name + "】（牙齿永久性黄染及骨骼生长发育受阻高危风险）。",
                        List.of(item.medicationRequestId()),
                        "8周岁以下儿童骨骼和牙齿发育期禁用四环素类抗生素（多西环素、米诺环素等）。请根据临床指征选用大环内酯类或青霉素类/头孢类适宜抗菌药。"
                ));
            }

            // 4. 6岁以下禁用氨基糖苷类抗生素（耳毒性及肾毒性高危）
            if (age < 6 && isSystemicAminoglycoside(tenantId, medId, name, doseForm)) {
                findings.add(new MedicationSafetyFinding(
                        GlobalIds.next(),
                        version,
                        "患者年龄（" + age + "岁）未满6周岁，禁用氨基糖苷类抗生素【" + name + "】（不可逆耳蜗前庭神经毒性导致永久性药物性耳聋与急性肾损伤高危风险）。",
                        List.of(item.medicationRequestId()),
                        "6周岁以下儿童及婴幼儿禁忌使用氨基糖苷类抗生素（庆大霉素、阿米卡星等）。请更换为儿童适用的无耳毒性、低肾毒性抗菌药。"
                ));
            }
        }

        return findings;
    }

    private boolean isSystemicQuinolone(Long tenantId, Long medId, String name, String doseForm) {
        if (name == null || name.isBlank()) return false;
        // 外用制剂不吸收，不引发全身软骨损伤禁忌
        for (String topical : TOPICAL_FORMS) {
            if (name.contains(topical) || (doseForm != null && doseForm.contains(topical))) {
                return false;
            }
        }

        if (safetyCategories != null) {
            return safetyCategories.isMedicationInCategory(tenantId, medId, name, CAT_QUINOLONE, doseForm);
        }

        for (String quinolone : FALLBACK_QUINOLONES) {
            if (name.contains(quinolone)) {
                return true;
            }
        }
        return false;
    }

    private boolean isAspirin(Long tenantId, Long medId, String name, String doseForm) {
        if (name == null || name.isBlank()) return false;
        for (String topical : TOPICAL_FORMS) {
            if (name.contains(topical) || (doseForm != null && doseForm.contains(topical))) {
                return false;
            }
        }

        if (safetyCategories != null) {
            return safetyCategories.isMedicationInCategory(tenantId, medId, name, CAT_ASPIRIN, doseForm);
        }

        return name.contains("阿司匹林") || name.contains("乙酰水杨酸") || name.contains("巴米尔");
    }

    private boolean isSystemicTetracycline(Long tenantId, Long medId, String name, String doseForm) {
        if (name == null || name.isBlank()) return false;
        for (String topical : TOPICAL_FORMS) {
            if (name.contains(topical) || (doseForm != null && doseForm.contains(topical))) {
                return false;
            }
        }

        if (safetyCategories != null) {
            return safetyCategories.isMedicationInCategory(tenantId, medId, name, CAT_TETRACYCLINE, doseForm);
        }

        for (String stem : FALLBACK_TETRACYCLINES) {
            if (name.contains(stem)) {
                return true;
            }
        }
        return false;
    }

    private boolean isSystemicAminoglycoside(Long tenantId, Long medId, String name, String doseForm) {
        if (name == null || name.isBlank()) return false;
        for (String topical : TOPICAL_FORMS) {
            if (name.contains(topical) || (doseForm != null && doseForm.contains(topical))) {
                return false;
            }
        }

        if (safetyCategories != null) {
            return safetyCategories.isMedicationInCategory(tenantId, medId, name, CAT_AMINOGLYCOSIDE, doseForm);
        }

        for (String stem : FALLBACK_AMINOGLYCOSIDES) {
            if (name.contains(stem)) {
                return true;
            }
        }
        return false;
    }
}
