package com.rhn.outpatient.api;

import java.util.List;

/** Derived from saved clinical content; it is neither an approval state nor patient evidence. */
public record PlanSearchProfile(int schemaVersion, String contentHash, String summary,
                                List<String> keywords, List<String> conditions,
                                List<OutpatientPlanTemplateDirectory.DiagnosisSnapshot> diagnoses,
                                Long noteTemplateId, String noteContentHash) {
    public PlanSearchProfile {
        keywords = keywords == null ? List.of() : List.copyOf(keywords);
        conditions = conditions == null ? List.of() : List.copyOf(conditions);
        diagnoses = diagnoses == null ? List.of() : List.copyOf(diagnoses);
    }
}
