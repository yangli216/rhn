package com.rhn.quality.medication.domain.rule;

import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.quality.medication.domain.*;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import java.util.*;

/** Same reference specification, regardless of local name/code, operational ID or manufacturer. */
public final class StandardReferenceDuplicateRule implements MedicationSafetyRule {
    public static final String IMPLEMENTATION = "java:standard-reference-duplicate:1";
    private final JsonCodec json;
    public StandardReferenceDuplicateRule(JsonCodec json) { this.json = json; }
    @Override public String code() { return DuplicateMedicationRule.CODE; }
    @Override public String implementationKey() { return IMPLEMENTATION; }
    @Override public List<MedicationSafetyFinding> evaluate(PrescriptionSafetySnapshot snapshot, RuleVersion version) {
        var active = snapshot.medications().stream().filter(PrescriptionSafetySnapshot.MedicationItem::activeForEvaluation).toList();
        if (active.isEmpty()) throw new MissingSafetyDataException();
        var groups = new TreeMap<String, List<Long>>();
        for (var item : active) {
            try {
                var reference = json.readTree(item.medicationSnapshot()).path("clinicalSemantics").path("standardReference");
                if (!"LINKED".equals(reference.path("status").asString())) throw new MissingSafetyDataException();
                var parts = new ArrayList<String>();
                for (String key : List.of("catalogId", "catalogVersion", "contentHash", "specificationId")) {
                    String value = reference.path(key).asString("");
                    if (value.isBlank()) throw new MissingSafetyDataException();
                    parts.add(value);
                }
                groups.computeIfAbsent(String.join("|", parts), ignored -> new ArrayList<>()).add(item.medicationRequestId());
            } catch (RuntimeException exception) { throw new MissingSafetyDataException(); }
        }
        return groups.values().stream().filter(ids -> ids.size() > 1)
                .map(ids -> new MedicationSafetyFinding(GlobalIds.next(), version,
                        "同一处方存在关联相同标准规格的多条有效医嘱，请核对是否为有意分次或分组开立。",
                        ids.stream().sorted().toList(), "按标准规格核对用途、剂量与执行安排；此提示不代表不合理用药判定。"))
                .toList();
    }
}
