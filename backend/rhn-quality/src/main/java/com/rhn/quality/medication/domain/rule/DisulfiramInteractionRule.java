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

/**
 * 双硫仑样反应（Disulfiram-like reaction）配伍禁忌核查。
 * 头孢类（头孢曲松、头孢哌酮、头孢唑林等）及咪唑类（甲硝唑、替硝唑等）可抑制乙醛脱氢酶；
 * 与含乙醇制剂（藿香正气水、氢化可的松注射液、复方甘草口服溶液等）联合使用会导致体内乙醛急性蓄积，严重者导致休克猝死。
 */
public final class DisulfiramInteractionRule implements MedicationSafetyRule {
    public static final String CODE = "QMED.DISULFIRAM_INTERACTION";
    public static final String IMPLEMENTATION = "java:disulfiram-interaction:1";

    // 类别 A：可引起双硫仑样反应的抗菌/抗原虫药物
    private static final List<String> DISULFIRAM_INDUCERS = List.of(
            "头孢哌酮", "头孢曲松", "头孢唑林", "头孢米诺", "头孢孟多",
            "头孢替安", "头孢尼西", "头孢拉定", "拉氧头孢",
            "甲硝唑", "替硝唑", "奥硝唑", "呋喃唑酮"
    );

    // 类别 B：常见含乙醇溶剂/辅料的药物制剂或中成药
    private static final List<String> ETHANOL_CONTAINING_DRUGS = List.of(
            "藿香正气水", "氢化可的松注射液", "复方甘草口服溶液", "硝酸甘油注射液",
            "十滴水", "地西泮注射液", "感冒止咳糖浆", "碘酊", "医用酒精", "乙醇"
    );

    private final JsonCodec json;

    public DisulfiramInteractionRule(JsonCodec json) {
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

        var matchedInducers = new ArrayList<PrescriptionSafetySnapshot.MedicationItem>();
        var inducerNames = new LinkedHashSet<String>();

        var matchedEthanol = new ArrayList<PrescriptionSafetySnapshot.MedicationItem>();
        var ethanolNames = new LinkedHashSet<String>();

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
            String spec = med.path("preparationSpec").asText("");

            if (isDisulfiramInducer(name)) {
                matchedInducers.add(item);
                inducerNames.add(name);
            }

            if (isEthanolDrug(name, spec)) {
                matchedEthanol.add(item);
                ethanolNames.add(name);
            }
        }

        if (!matchedInducers.isEmpty() && !matchedEthanol.isEmpty()) {
            var allRequestIds = new ArrayList<Long>();
            matchedInducers.forEach(i -> allRequestIds.add(i.medicationRequestId()));
            matchedEthanol.forEach(i -> allRequestIds.add(i.medicationRequestId()));

            return List.of(new MedicationSafetyFinding(
                    GlobalIds.next(),
                    version,
                    "处方中【" + String.join("、", inducerNames) + "】与含乙醇制剂【" + String.join("、", ethanolNames) + "】联合使用，存在引发严重双硫仑样反应（乙醛蓄积中毒）高危风险，禁忌同方联用。",
                    allRequestIds.stream().distinct().sorted().toList(),
                    "头孢类/咪唑类药物抑制体内乙醛脱氢酶，与含乙醇制剂联用可引发面红、心悸、胸闷、呼吸困难及过敏性休克。严禁联合使用，且停药后7日内应避免摄入酒精及含酒精药物。"
            ));
        }

        return List.of();
    }

    private boolean isDisulfiramInducer(String name) {
        if (name == null || name.isBlank()) return false;
        for (String inducer : DISULFIRAM_INDUCERS) {
            if (name.contains(inducer)) {
                return true;
            }
        }
        return false;
    }

    private boolean isEthanolDrug(String name, String spec) {
        if (name == null || name.isBlank()) return false;
        // 注意：藿香正气口服液/软胶囊不含乙醇，只有藿香正气水含乙醇
        if (name.contains("藿香正气口服液") || name.contains("藿香正气胶囊") || name.contains("藿香正气滴丸")) {
            return false;
        }
        for (String ethanolDrug : ETHANOL_CONTAINING_DRUGS) {
            if (name.contains(ethanolDrug)) {
                return true;
            }
        }
        if (spec != null && spec.contains("乙醇")) {
            return true;
        }
        return false;
    }
}
