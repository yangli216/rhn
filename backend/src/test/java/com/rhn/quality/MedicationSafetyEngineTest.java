package com.rhn.quality;

import com.rhn.outpatient.api.MedicationSafetyDecision.Status;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.quality.medication.application.DecisionAggregator;
import com.rhn.quality.medication.application.MedicationSafetyEngine;
import com.rhn.quality.medication.domain.MedicationSafetyFinding;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.quality.medication.domain.rule.DuplicateMedicationRule;
import com.rhn.quality.medication.domain.rule.MedicationSafetyRule;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static com.rhn.quality.MedicationSafetyFixtures.*;
import static org.junit.jupiter.api.Assertions.*;

class MedicationSafetyEngineTest {
    private final MedicationSafetyEngine engine = new MedicationSafetyEngine(List.of(new DuplicateMedicationRule()));
    private static final Instant NOW = Instant.parse("2026-09-15T00:00:00Z");

    @Test
    void exact_generic_duplicate_across_products_is_one_finding_with_sorted_item_ids() {
        var input = snapshot(item(12, 90L, "ACTIVE"), item(11, 90L, "DRAFT"), item(13, 91L, "DRAFT"));
        var result = engine.evaluate(input, List.of(version(Status.WARN)), NOW);
        assertEquals(Status.WARN, result.decision());
        assertEquals(1, result.findings().size());
        assertEquals(List.of(11L, 12L), result.findings().getFirst().medicationRequestIds());
        assertFalse(result.findings().getFirst().rule().evidence().isEmpty());
        assertEquals("COMPLETED", result.executions().getFirst().outcome());
        var repeated = engine.evaluate(input, List.of(version(Status.WARN)), NOW);
        assertEquals(result.decision(), repeated.decision());
        assertEquals(result.findings().getFirst().message(), repeated.findings().getFirst().message());
        assertEquals(result.findings().getFirst().medicationRequestIds(), repeated.findings().getFirst().medicationRequestIds());
    }

    @Test
    void distinct_generics_and_cancelled_duplicates_do_not_trigger() {
        var result = engine.evaluate(snapshot(item(11, 90L, "DRAFT"), item(12, 91L, "ACTIVE"),
                item(13, 90L, "CANCELLED")), List.of(version(Status.WARN)), NOW);
        assertEquals(Status.PASS, result.decision());
        assertTrue(result.findings().isEmpty());
    }

    @Test
    void missing_identity_or_empty_active_prescription_is_unavailable() {
        for (var input : List.of(snapshot(), snapshot(item(11, null, "ACTIVE")), snapshot(item(11, 90L, "CANCELLED")))) {
            var result = engine.evaluate(input, List.of(version(Status.WARN)), NOW);
            assertEquals(Status.UNAVAILABLE, result.decision());
            assertEquals(List.of("REQUIRED_INPUT_MISSING"), result.failureCodes());
        }
    }

    @Test
    void absent_or_duplicate_registry_versions_cannot_pass() {
        assertEquals(Status.UNAVAILABLE, engine.evaluate(snapshot(item(11, 90L, "DRAFT")), List.of(), NOW).decision());
        assertEquals(Status.UNAVAILABLE, engine.evaluate(snapshot(item(11, 90L, "DRAFT")),
                List.of(version(Status.WARN), version(Status.WARN)), NOW).decision());
    }

    @Test
    void execution_failure_and_not_yet_effective_version_are_recorded_as_unavailable() {
        MedicationSafetyRule failing = new MedicationSafetyRule() {
            public String code() { return DuplicateMedicationRule.CODE; }
            public String implementationKey() { return DuplicateMedicationRule.IMPLEMENTATION; }
            public List<MedicationSafetyFinding> evaluate(PrescriptionSafetySnapshot input, RuleVersion version) {
                throw new IllegalStateException("simulated rule failure");
            }
        };
        var result = new MedicationSafetyEngine(List.of(failing)).evaluate(snapshot(item(11, 90L, "DRAFT")),
                List.of(version(Status.WARN)), NOW);
        assertEquals(Status.UNAVAILABLE, result.decision());
        assertEquals("RULE_EXECUTION_FAILED", result.executions().getFirst().failureCode());
        assertEquals(Status.UNAVAILABLE, engine.evaluate(snapshot(item(11, 90L, "DRAFT")),
                List.of(version(Status.WARN)), Instant.parse("2025-01-01T00:00:00Z")).decision());
    }

    @Test
    void aggregation_keeps_action_separate_from_severity_and_preserves_incompleteness() {
        assertEquals(Status.PASS, DecisionAggregator.aggregate(List.of(), false));
        assertEquals(Status.WARN, DecisionAggregator.aggregate(List.of(Status.WARN, Status.PASS), false));
        assertEquals(Status.REQUIRE_OVERRIDE, DecisionAggregator.aggregate(List.of(Status.WARN, Status.REQUIRE_OVERRIDE), false));
        assertEquals(Status.BLOCK, DecisionAggregator.aggregate(List.of(Status.BLOCK, Status.REQUIRE_OVERRIDE), false));
        assertEquals(Status.UNAVAILABLE, DecisionAggregator.aggregate(List.of(Status.WARN), true));
        assertEquals(Status.UNAVAILABLE, DecisionAggregator.aggregate(List.of(Status.REQUIRE_OVERRIDE), true));
        assertEquals(Status.UNAVAILABLE, DecisionAggregator.aggregate(List.of(Status.UNAVAILABLE), false));
        assertEquals(Status.BLOCK, DecisionAggregator.aggregate(List.of(Status.BLOCK), true));
    }

    @Test
    void snapshot_is_immutable_and_duplicate_request_identity_is_rejected() {
        var items = new ArrayList<>(List.of(item(11, 90L, "DRAFT")));
        var input = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 2L, 0,
                3L, 4L, 5L, 6L, "DRAFT", items);
        items.clear();
        assertEquals(1, input.medications().size());
        assertThrows(UnsupportedOperationException.class, () -> input.medications().clear());
        assertThrows(IllegalArgumentException.class, () -> snapshot(item(11, 90L, "DRAFT"), item(11, 90L, "DRAFT")));
    }

    @Test
    void unsupported_item_status_and_schema_cannot_silently_skip_checks() {
        assertEquals(Status.UNAVAILABLE, engine.evaluate(snapshot(item(11, 90L, "DRAFT"), item(12, 90L, "UNKNOWN")),
                List.of(version(Status.WARN)), NOW).decision());
        var unsupported = new PrescriptionSafetySnapshot("future-v2", 1L, 2L, 0, 3L, 4L, 5L, 6L,
                "DRAFT", List.of(item(11, 90L, "DRAFT")));
        assertEquals(Status.UNAVAILABLE, engine.evaluate(unsupported, List.of(version(Status.WARN)), NOW).decision());
    }
}
