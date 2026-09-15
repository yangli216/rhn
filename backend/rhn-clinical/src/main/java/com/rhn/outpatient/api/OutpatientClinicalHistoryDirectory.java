package com.rhn.outpatient.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Minimal longitudinal outpatient facts for authorized clinical decision-support consumers. */
public interface OutpatientClinicalHistoryDirectory {
    List<EncounterHistorySnapshot> recentForResident(Long residentId, Long currentEncounterId,
                                                     Instant since, int limit);

    record EncounterHistorySnapshot(Long encounterId, long encounterRevision, Instant registeredAt,
                                    List<DiagnosisFact> diagnoses, List<MedicationFact> medications,
                                    List<ServiceFact> services) {
        public EncounterHistorySnapshot {
            diagnoses = diagnoses == null ? List.of() : List.copyOf(diagnoses);
            medications = medications == null ? List.of() : List.copyOf(medications);
            services = services == null ? List.of() : List.copyOf(services);
        }
    }

    record DiagnosisFact(Long id, String code, String display, String type) {}

    record MedicationFact(Long id, long revision, String status, String code, String name,
                          BigDecimal doseValue, String doseUnit, String routeCode, String frequencyCode,
                          BigDecimal durationValue, String durationUnit, BigDecimal quantity,
                          String quantityUnit, Instant authoredAt) {}

    record ServiceFact(Long id, long revision, String status, String serviceType, String code, String name,
                       BigDecimal quantity, String unitCode, String reason, String clinicalDescription,
                       Instant authoredAt) {}
}
