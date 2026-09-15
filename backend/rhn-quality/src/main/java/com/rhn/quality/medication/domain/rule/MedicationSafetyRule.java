package com.rhn.quality.medication.domain.rule;

import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.quality.medication.domain.MedicationSafetyFinding;
import com.rhn.quality.medication.domain.RuleVersion;
import java.util.List;

public interface MedicationSafetyRule {
    String code();
    String implementationKey();
    List<MedicationSafetyFinding> evaluate(PrescriptionSafetySnapshot snapshot, RuleVersion version);
}
