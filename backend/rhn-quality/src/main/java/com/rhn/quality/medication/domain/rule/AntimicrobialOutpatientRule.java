package com.rhn.quality.medication.domain.rule;

import tools.jackson.databind.JsonNode;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.quality.medication.domain.MedicationSafetyFinding;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

public final class AntimicrobialOutpatientRule implements MedicationSafetyRule {
    public static final String CODE = "QMED.ANTIMICROBIAL_OUTPATIENT";
    public static final String IMPLEMENTATION = "java:antimicrobial-outpatient:1";
    private final JsonCodec json;

    public AntimicrobialOutpatientRule(JsonCodec json) {
        this.json = json;
    }

    @Override public String code() { return CODE; }
    @Override public String implementationKey() { return IMPLEMENTATION; }

    @Override
    public List<MedicationSafetyFinding> evaluate(PrescriptionSafetySnapshot snapshot, RuleVersion version) {
        var active = snapshot.medications().stream()
                .filter(PrescriptionSafetySnapshot.MedicationItem::activeForEvaluation).toList();
        if (active.isEmpty()) return List.of();
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
            if (!med.path("antimicrobial").asBoolean(false)) {
                continue;
            }
            String name = med.path("name").asText(med.path("medicationName").asText("抗菌药物"));
            boolean outpatientAllowed = med.path("antimicrobialOutpatientAllowed").asBoolean(true);
            if (!outpatientAllowed) {
                findings.add(new MedicationSafetyFinding(GlobalIds.next(), version,
                        "药品【" + name + "】属于限制/特殊级抗菌药物，门诊禁止常规开立。",
                        List.of(item.medicationRequestId()),
                        "请调整为门诊可用抗菌药，或申请专科会诊后办理住院使用。"));
                continue;
            }
            if (med.hasNonNull("antimicrobialMaxDays") && item.durationValue() != null) {
                int maxDays = med.path("antimicrobialMaxDays").asInt();
                BigDecimal duration = item.durationValue();
                if (maxDays > 0 && duration.compareTo(BigDecimal.valueOf(maxDays)) > 0) {
                    findings.add(new MedicationSafetyFinding(GlobalIds.next(), version,
                            "药品【" + name + "】门诊开立疗程（" + duration.toPlainString() + "天）超过规定上限（" + maxDays + "天）。",
                            List.of(item.medicationRequestId()),
                            "请将疗程缩短至 " + maxDays + " 天以内，或在专科确认后填写超疗程用药理由。"));
                }
            }
        }
        return findings;
    }
}
