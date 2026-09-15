package com.rhn.quality.medication.domain.rule;

import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.quality.medication.domain.MedicationSafetyFinding;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.shared.id.GlobalIds;
import java.util.List;
import java.util.TreeMap;
import java.util.stream.Collectors;

/** Exact generic identity only. It makes no claim about therapeutic duplication or clinical appropriateness. */
public final class DuplicateMedicationRule implements MedicationSafetyRule {
    public static final String CODE = "QMED.EXACT_GENERIC_DUPLICATE";
    public static final String IMPLEMENTATION = "java:exact-generic-duplicate:1";

    @Override public String code() { return CODE; }
    @Override public String implementationKey() { return IMPLEMENTATION; }

    @Override
    public List<MedicationSafetyFinding> evaluate(PrescriptionSafetySnapshot snapshot, RuleVersion version) {
        var active = snapshot.medications().stream().filter(PrescriptionSafetySnapshot.MedicationItem::activeForEvaluation).toList();
        if (active.isEmpty() || active.stream().anyMatch(item -> item.medicationId() == null)) {
            throw new MissingSafetyDataException();
        }
        return active.stream().collect(Collectors.groupingBy(PrescriptionSafetySnapshot.MedicationItem::medicationId,
                        TreeMap::new, Collectors.toList())).values().stream()
                .filter(items -> items.size() > 1)
                .map(items -> new MedicationSafetyFinding(GlobalIds.next(), version,
                        "同一处方存在相同通用药的多条有效医嘱，请核对是否为有意分次或分组开立。",
                        items.stream().map(PrescriptionSafetySnapshot.MedicationItem::medicationRequestId).sorted().toList(),
                        "核对各条医嘱的用途、剂量与执行安排；此旁路提示不构成不合理用药判定。"))
                .toList();
    }
}
