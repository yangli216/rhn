package com.rhn.platform.masterdata.api;

import java.time.Instant;
import java.util.List;

/** Same tenant-scoped medication definitions and terminology consumed by HIS. */
public interface MedicationKnowledgeDirectory {
    List<Knowledge> search(String query);
    Knowledge require(Long medicationId);
    record Knowledge(CatalogLifecycleDirectory.MedicationSnapshot medication, long revision,
                     String semanticStatus, Instant capturedAt,
                     List<MedicationTerminologyDirectory.MedicationClassification> classifications,
                     List<MedicationTerminologyDirectory.AllergenTerm> allergens,
                     List<StandardMappingViews.ItemTermMappingView> standardMappings, MedicationStandardReference standardReference) {
        public Knowledge(CatalogLifecycleDirectory.MedicationSnapshot medication, long revision, String semanticStatus, Instant capturedAt,
                List<MedicationTerminologyDirectory.MedicationClassification> classifications, List<MedicationTerminologyDirectory.AllergenTerm> allergens,
                List<StandardMappingViews.ItemTermMappingView> standardMappings) {
            this(medication, revision, semanticStatus, capturedAt, classifications, allergens, standardMappings,
                    MedicationStandardReference.unavailable("UNMAPPED", "STANDARD_REFERENCE_MISSING"));
        }
    }
}
