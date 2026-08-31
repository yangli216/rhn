package com.rhn.outpatient.api;

import java.util.List;

/** Read-only projection of currently visible outpatient plan templates for decision-support consumers. */
public interface OutpatientPlanTemplateDirectory {
    List<PlanTemplateSnapshot> visibleForCurrentContext();

    record PlanTemplateSnapshot(Long id, String name, String description, long useCount,
                                List<DiagnosisSnapshot> diagnoses) {
        public PlanTemplateSnapshot {
            diagnoses = diagnoses == null ? List.of() : List.copyOf(diagnoses);
        }
    }

    record DiagnosisSnapshot(String code, String display, String type) {}
}
