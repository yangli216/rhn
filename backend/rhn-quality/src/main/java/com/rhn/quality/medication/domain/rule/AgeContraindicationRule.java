package com.rhn.quality.medication.domain.rule;

import tools.jackson.databind.JsonNode;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.quality.medication.domain.MedicationSafetyFinding;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import java.util.ArrayList;
import java.util.List;

/**
 * 儿童及特定年龄禁忌用药核查。
 * 1. 18周岁以下儿童青少年禁用氟喹诺酮类抗菌药（软骨损害风险）；
 * 2. 12周岁以下儿童禁用阿司匹林进行解热镇痛（瑞氏综合征 Reye's syndrome 致命风险）。
 */
public final class AgeContraindicationRule implements MedicationSafetyRule {
    public static final String CODE = "QMED.AGE_CONTRAINDICATION";
    public static final String IMPLEMENTATION = "java:age-contraindication:1";

    private static final List<String> QUINOLONES = List.of(
            "诺氟沙星", "左氧氟沙星", "环丙沙星", "莫西沙星", "氧氟沙星",
            "依诺沙星", "氟罗沙星", "洛美沙星", "加替沙星", "托氟沙星", "司帕沙星"
    );

    private static final List<String> TOPICAL_FORMS = List.of(
            "滴眼", "眼膏", "滴耳", "滴鼻", "凝胶", "乳膏", "软膏"
    );

    private final JsonCodec json;

    public AgeContraindicationRule(JsonCodec json) {
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

            // 1. 18岁以下禁用全身性氟喹诺酮类
            if (age < 18 && isSystemicQuinolone(name, doseForm)) {
                findings.add(new MedicationSafetyFinding(
                        GlobalIds.next(),
                        version,
                        "患者年龄（" + age + "岁）未满18周岁，禁用氟喹诺酮类抗菌药物【" + name + "】（骨骼生长发育期关节软骨损伤风险）。",
                        List.of(item.medicationRequestId()),
                        "18周岁以下骨骼处于生长发育期的儿童及青少年禁用氟喹诺酮类药物。请更换为儿童适用的β-内酰胺类（青霉素类/头孢菌素类）或大环内酯类抗菌药。"
                ));
            }

            // 2. 12岁以下禁用阿司匹林解热镇痛（瑞氏综合征风险）
            if (age < 12 && isAspirin(name, doseForm)) {
                findings.add(new MedicationSafetyFinding(
                        GlobalIds.next(),
                        version,
                        "患者年龄（" + age + "岁）不满12周岁，开立【" + name + "】存在诱发严重瑞氏综合征（Reye综合征）风险。",
                        List.of(item.medicationRequestId()),
                        "12岁以下儿童病毒性感冒发热禁用阿司匹林解热镇痛。退热建议更换为儿童适用的布洛芬或对乙酰氨基酚。"
                ));
            }
        }

        return findings;
    }

    private boolean isSystemicQuinolone(String name, String doseForm) {
        if (name == null || name.isBlank()) return false;
        boolean matched = false;
        for (String q : QUINOLONES) {
            if (name.contains(q)) {
                matched = true;
                break;
            }
        }
        if (!matched && name.endsWith("沙星")) {
            matched = true;
        }
        if (!matched) return false;

        for (String topical : TOPICAL_FORMS) {
            if (doseForm.contains(topical) || name.contains(topical)) {
                return false;
            }
        }
        return true;
    }

    private boolean isAspirin(String name, String doseForm) {
        if (name == null || name.isBlank()) return false;
        return name.contains("阿司匹林") || name.contains("乙酰水杨酸");
    }
}
