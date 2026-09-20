package com.rhn.quality.medication.application;

import com.rhn.outpatient.api.MedicationSafetyDecision;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.quality.medication.domain.MedicationSafetyFinding;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.quality.medication.domain.rule.MedicationSafetyRule;
import com.rhn.quality.medication.domain.rule.MissingSafetyDataException;
import com.rhn.shared.json.JsonCodec;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

public final class MedicationSafetyEngine {
    public static final String VERSION = "qmed-engine-2";
    public static final String LEGACY_RULE_SET = "qmed-foundation-shadow-v1";
    public static final String RULE_SET = "qmed-standard-shadow-v2";
    private final Map<String, MedicationSafetyRule> rules;
    private final java.util.Set<String> ruleCodes;

    public MedicationSafetyEngine(List<MedicationSafetyRule> rules) {
        this.rules = rules.stream().collect(Collectors.toUnmodifiableMap(MedicationSafetyRule::implementationKey, Function.identity()));
        this.ruleCodes = rules.stream().map(MedicationSafetyRule::code).collect(Collectors.toUnmodifiableSet());
        if (rules.isEmpty()) throw new IllegalArgumentException("A safety engine needs at least one rule");
    }

    /** One centrally defined runtime catalog is shared by production review and workbench validation. */
    public static MedicationSafetyEngine standard(JsonCodec json) {
        return new MedicationSafetyEngine(List.of(
                new com.rhn.quality.medication.domain.rule.DuplicateMedicationRule(),
                new com.rhn.quality.medication.domain.rule.StandardReferenceDuplicateRule(json),
                new com.rhn.quality.medication.domain.rule.AntimicrobialOutpatientRule(json),
                new com.rhn.quality.medication.domain.rule.DrugAllergyRule(json),
                new com.rhn.quality.medication.domain.rule.SkinTestRequirementRule(json),
                new com.rhn.quality.medication.domain.rule.NsaidDuplicateRule(json),
                new com.rhn.quality.medication.domain.rule.AgeContraindicationRule(json),
                new com.rhn.quality.medication.domain.rule.DisulfiramInteractionRule(json)));
    }

    public Result evaluate(PrescriptionSafetySnapshot input, List<RuleVersion> versions, Instant time) {
        return evaluate(input, versions, time, true);
    }

    /** Workbench-only entry point: validates a non-empty subset without weakening production completeness checks. */
    public Result evaluateSelected(PrescriptionSafetySnapshot input, List<RuleVersion> versions, Instant time) {
        return evaluate(input, versions, time, false);
    }

    private Result evaluate(PrescriptionSafetySnapshot input, List<RuleVersion> versions, Instant time,
                            boolean requireCompleteRuleSet) {
        var findings = new ArrayList<MedicationSafetyFinding>();
        var executions = new ArrayList<MedicationSafetyDecision.RuleExecution>();
        var failures = new ArrayList<String>();
        if (!List.of(PrescriptionSafetySnapshot.SCHEMA_VERSION, "qmed-prescription-v1").contains(input.schemaVersion())
                || !List.of("DRAFT", "ACTIVE").contains(input.prescriptionStatus())
                || input.medications().stream().anyMatch(item -> !List.of("DRAFT", "ACTIVE", "CANCELLED").contains(item.status()))) {
            return new Result(List.of(), List.of(), List.of("INPUT_UNSUPPORTED"));
        }
        var codes = versions.stream().map(version -> version.definition().code()).toList();
        var selectedCodes = java.util.Set.copyOf(codes);
        if (codes.isEmpty() || codes.size() != codes.stream().distinct().count()
                || !ruleCodes.containsAll(selectedCodes)
                || requireCompleteRuleSet && !ruleCodes.equals(selectedCodes)) {
            return new Result(List.of(), List.of(), List.of("RULE_SET_INCOMPLETE"));
        }
        for (var version : versions.stream().sorted(java.util.Comparator.comparing(v -> v.definition().code())).toList()) {
            var rule = rules.get(version.implementationKey());
            String failure = null;
            if (rule == null || !List.of(RULE_SET, LEGACY_RULE_SET).contains(version.ruleSetVersion()) || !version.availableAt(time)
                    || !rule.code().equals(version.definition().code()) || versions.stream().map(RuleVersion::ruleSetVersion).distinct().count() != 1) {
                failure = "RULE_VERSION_UNAVAILABLE";
            } else {
                try {
                    findings.addAll(rule.evaluate(input, version));
                } catch (MissingSafetyDataException exception) {
                    failure = "REQUIRED_INPUT_MISSING";
                } catch (RuntimeException exception) {
                    failure = "RULE_EXECUTION_FAILED";
                }
            }
            executions.add(new MedicationSafetyDecision.RuleExecution(version.definition().code(), version.version(),
                    failure == null ? "COMPLETED" : "UNAVAILABLE", failure));
            if (failure != null) failures.add(failure);
        }
        return new Result(findings, executions, failures);
    }

    public record Result(List<MedicationSafetyFinding> findings,
                         List<MedicationSafetyDecision.RuleExecution> executions, List<String> failureCodes) {
        public Result {
            findings = List.copyOf(findings); executions = List.copyOf(executions); failureCodes = List.copyOf(failureCodes);
        }
        public MedicationSafetyDecision.Status decision() {
            return DecisionAggregator.aggregate(findings.stream().map(finding -> finding.rule().decision()).toList(),
                    !failureCodes.isEmpty());
        }
    }
}
