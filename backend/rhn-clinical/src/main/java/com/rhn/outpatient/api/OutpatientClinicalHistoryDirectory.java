package com.rhn.outpatient.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Minimal longitudinal outpatient facts for authorized clinical decision-support consumers. */
public interface OutpatientClinicalHistoryDirectory {
    List<EncounterHistorySnapshot> recentForResident(Long residentId, Long currentEncounterId,
                                                     Instant since, int limit);

    /** All active facts for each selected encounter; model payload limits belong at the model boundary. */
    record EncounterHistorySnapshot(Long encounterId, long encounterRevision, Instant registeredAt,
                                    List<DiagnosisFact> diagnoses, List<MedicationFact> medications,
                                    List<ServiceFact> services) {
        public EncounterHistorySnapshot {
            diagnoses = List.copyOf(diagnoses);
            medications = List.copyOf(medications);
            services = List.copyOf(services);
        }
    }

    record DiagnosisFact(Long id, String code, String display, String type) {}

    record MedicationFact(Long id, long revision, String status, String code, String name,
                          BigDecimal doseValue, String doseUnit, String routeCode, String frequencyCode,
                          BigDecimal durationValue, String durationUnit, BigDecimal quantity,
                          String quantityUnit, Instant authoredAt, MedicationCatalogFact catalog, MedicationUsageFact usage) {}

    /** Original administration semantics persisted when the order was authored. */
    record MedicationUsageFact(Long routeId, String routeExecutionType, String routeResolutionStatus,
                               Long frequencyId, String frequencyRuleSnapshot) {}

    /** Persisted order facts, never reconstructed from today's catalog or stock defaults. */
    record MedicationCatalogFact(Long medicationId, Long catalogItemId, Long packageId,
                                 String preparationSpec, String preparationUnit,
                                 BigDecimal baseQuantity, String baseUnit, BigDecimal packageFactor,
                                 String packageUnitName, String packageSpec, boolean substitutionAllowed,
                                 boolean selfProvided, String priceType, String instruction) {
        public MedicationCatalogFact {
            baseQuantity = baseQuantity == null ? null : baseQuantity.stripTrailingZeros();
            packageFactor = packageFactor == null ? null : packageFactor.stripTrailingZeros();
        }
    }

    record ServiceFact(Long id, long revision, String status, String serviceType, String code, String name,
                       BigDecimal quantity, String unitCode, String reason, String clinicalDescription,
                       Instant authoredAt) {}
}
