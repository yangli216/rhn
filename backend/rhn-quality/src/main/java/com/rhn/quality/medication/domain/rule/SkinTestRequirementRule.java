package com.rhn.quality.medication.domain.rule;

import tools.jackson.databind.JsonNode;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.quality.medication.domain.MedicationSafetyFinding;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import java.util.ArrayList;
import java.util.List;

public final class SkinTestRequirementRule implements MedicationSafetyRule {
    public static final String CODE = "QMED.SKIN_TEST";
    public static final String IMPLEMENTATION = "java:skin-test:1";
    private final JsonCodec json;

    public SkinTestRequirementRule(JsonCodec json) {
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
            if (!med.path("skinTestRequired").asBoolean(false)) {
                continue;
            }
            String name = med.path("name").asText(med.path("medicationName").asText("需皮试药品"));
            if (item.skinTestExempt()) {
                boolean hasReason = item.skinTestExemptReason() != null && !item.skinTestExemptReason().isBlank();
                boolean hasEvidence = item.exemptEvidenceEventId() != null;
                if (!hasReason && !hasEvidence) {
                    findings.add(new MedicationSafetyFinding(GlobalIds.next(), version,
                            "药品【" + name + "】标注皮试免试，但缺少免试理由或有效历史阴性凭据。",
                            List.of(item.medicationRequestId()),
                            "请填写免试理由或补充关联近期皮试阴性凭据。"));
                }
            } else {
                findings.add(new MedicationSafetyFinding(GlobalIds.next(), version,
                        "药品【" + name + "】开立前必须具有有效的阴性皮试结果，当前未登记免试记录。",
                        List.of(item.medicationRequestId()),
                        "请开立皮试医嘱完成试验；或在确认24小时内同批号原药阴性后勾选免试。"));
            }
        }
        return findings;
    }
}
