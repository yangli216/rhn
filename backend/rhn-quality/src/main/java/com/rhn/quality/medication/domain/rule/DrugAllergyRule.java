package com.rhn.quality.medication.domain.rule;

import tools.jackson.databind.JsonNode;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.quality.medication.domain.MedicationSafetyFinding;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import java.util.ArrayList;
import java.util.List;

public final class DrugAllergyRule implements MedicationSafetyRule {
    public static final String CODE = "QMED.DRUG_ALLERGY";
    public static final String IMPLEMENTATION = "java:drug-allergy:1";
    private final JsonCodec json;

    public DrugAllergyRule(JsonCodec json) {
        this.json = json;
    }

    @Override public String code() { return CODE; }
    @Override public String implementationKey() { return IMPLEMENTATION; }

    @Override
    public List<MedicationSafetyFinding> evaluate(PrescriptionSafetySnapshot snapshot, RuleVersion version) {
        var context = snapshot.patientContext();
        if (context == null) {
            return List.of();
        }
        var active = snapshot.medications().stream()
                .filter(PrescriptionSafetySnapshot.MedicationItem::activeForEvaluation).toList();
        if (active.isEmpty()) return List.of();

        var findings = new ArrayList<MedicationSafetyFinding>();

        if (!context.allergyStatusRecorded() && !context.allergyReviewConfirmed()) {
            findings.add(new MedicationSafetyFinding(GlobalIds.next(), version,
                    "患者药物过敏状态尚未采集或核对，请在问诊中核对过敏史后再行开方。",
                    active.stream().map(PrescriptionSafetySnapshot.MedicationItem::medicationRequestId).toList(),
                    "询问并确认患者过敏史，并勾选过敏复核确认。"));
            return findings;
        }

        var allergies = context.activeAllergies();
        if (!allergies.isEmpty() && !context.allergyReviewConfirmed()) {
            findings.add(new MedicationSafetyFinding(GlobalIds.next(), version,
                    "患者存在有效药物过敏记录，需医生核对确认后方可继续开立。",
                    active.stream().map(PrescriptionSafetySnapshot.MedicationItem::medicationRequestId).toList(),
                    "核对患者既往过敏记录并确认本次用药安全。"));
        }

        if (allergies.isEmpty()) {
            return findings;
        }

        boolean hasOverride = context.allergyOverrideReason() != null && !context.allergyOverrideReason().isBlank();

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
            String code = med.path("code").asText("");
            String name = med.path("name").asText(med.path("medicationName").asText("处方药品"));

            for (var allergy : allergies) {
                boolean match = false;
                String matchedAllergen = null;
                if (allergy.substanceCode() != null && !allergy.substanceCode().isBlank()
                        && allergy.substanceCode().equalsIgnoreCase(code)) {
                    match = true;
                    matchedAllergen = allergy.substanceCode();
                } else if (allergy.substanceName() != null && !allergy.substanceName().isBlank()
                        && name.contains(allergy.substanceName())) {
                    match = true;
                    matchedAllergen = allergy.substanceName();
                } else if (allergy.allergenDisplay() != null && !allergy.allergenDisplay().isBlank()
                        && name.contains(allergy.allergenDisplay())) {
                    match = true;
                    matchedAllergen = allergy.allergenDisplay();
                }

                if (match && !hasOverride) {
                    findings.add(new MedicationSafetyFinding(GlobalIds.next(), version,
                            "药品【" + name + "】命中患者既往过敏原（" + matchedAllergen + "），未填写临床理由不可开立。",
                            List.of(item.medicationRequestId()),
                            "更换非过敏替代药品；若救治特殊需要，请在处方中详细填写覆盖理由。"));
                }
            }
        }

        return findings;
    }
}
