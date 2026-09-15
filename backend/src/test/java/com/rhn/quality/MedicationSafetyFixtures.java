package com.rhn.quality;

import com.rhn.outpatient.api.MedicationSafetyDecision;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.quality.medication.application.MedicationSafetyEngine;
import com.rhn.quality.medication.domain.RuleDefinition;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.quality.medication.domain.rule.DuplicateMedicationRule;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class MedicationSafetyFixtures {
    private MedicationSafetyFixtures() {}

    public static PrescriptionSafetySnapshot snapshot(PrescriptionSafetySnapshot.MedicationItem... items) {
        return new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION,
                1L, 2L, 0, 3L, 4L, 5L, 6L, "DRAFT", List.of(items));
    }

    public static PrescriptionSafetySnapshot.MedicationItem item(long id, Long medicationId, String status) {
        return new PrescriptionSafetySnapshot.MedicationItem(id, 0, medicationId, id + 1000, null,
                status, "LEGACY", new BigDecimal("5.00"), "mg", 100L, "PO", "ORAL", "RESOLVED",
                200L, "QD", "{\"revision\":1,\"ruleType\":\"TIMES_PER_PERIOD\",\"frequencyCount\":1}",
                BigDecimal.ONE, "DAY", "{\"strengthValue\":5}", "{}", "{}");
    }

    public static RuleVersion version(MedicationSafetyDecision.Status status) {
        return new RuleVersion(362387869899102L,
                new RuleDefinition(362387869899101L, DuplicateMedicationRule.CODE, "EXACT_GENERIC_DUPLICATE", "重复核对"),
                1, MedicationSafetyEngine.RULE_SET, DuplicateMedicationRule.IMPLEMENTATION, "SHADOW",
                MedicationSafetyDecision.Severity.LOW, status, MedicationSafetyDecision.OverridePolicy.ACKNOWLEDGE,
                Instant.parse("2026-01-01T00:00:00Z"), null,
                List.of(new MedicationSafetyDecision.Evidence("ENGINEERING_BASELINE", "test specification", "1",
                        "test", "duplicate", "exact identity", "SHADOW_ONLY")));
    }
}
