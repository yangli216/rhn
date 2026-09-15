package com.rhn.outpatient.ordering;

import com.rhn.healthcore.api.EncounterDiagnosisDirectory;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.OutpatientClinicalHistoryDirectory;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Set;

@Component
class JpaOutpatientClinicalHistoryDirectory implements OutpatientClinicalHistoryDirectory {
    private static final Set<String> OMITTED_ORDER_STATUSES = Set.of("DRAFT", "CANCELLED");

    private final EncounterDirectory encounters;
    private final EncounterDiagnosisDirectory diagnoses;
    private final MedicationRequestRepository medications;
    private final ServiceRequestRepository services;
    private final ExecutionContextProvider contextProvider;

    JpaOutpatientClinicalHistoryDirectory(EncounterDirectory encounters,
                                          EncounterDiagnosisDirectory diagnoses,
                                          MedicationRequestRepository medications,
                                          ServiceRequestRepository services,
                                          ExecutionContextProvider contextProvider) {
        this.encounters = encounters;
        this.diagnoses = diagnoses;
        this.medications = medications;
        this.services = services;
        this.contextProvider = contextProvider;
    }

    @Override
    @Transactional(readOnly = true)
    public List<EncounterHistorySnapshot> recentForResident(Long residentId, Long currentEncounterId,
                                                            Instant since, int limit) {
        var context = contextProvider.requireCurrent();
        int cappedLimit = Math.max(0, Math.min(limit, 10));
        if (cappedLimit == 0) return List.of();
        return encounters.recentForResident(residentId, 20).stream()
                .filter(value -> !value.id().equals(currentEncounterId))
                .filter(value -> "COMPLETED".equals(value.status()))
                .filter(value -> since == null || value.registeredAt() != null && !value.registeredAt().isBefore(since))
                .limit(cappedLimit)
                .map(value -> snapshot(context.tenantId(), value))
                .toList();
    }

    private EncounterHistorySnapshot snapshot(Long tenantId, EncounterDirectory.EncounterSnapshot encounter) {
        List<DiagnosisFact> diagnosisFacts = diagnoses.findActiveDiagnoses(tenantId, encounter.id(), "ENCOUNTER")
                .stream().limit(20).map(value -> new DiagnosisFact(value.id(), value.code(), value.display(),
                        value.diagnosisType())).toList();
        List<MedicationFact> medicationFacts = medications
                .findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(tenantId, encounter.id()).stream()
                .filter(value -> !OMITTED_ORDER_STATUSES.contains(value.status())).limit(50)
                .map(value -> new MedicationFact(value.id(), value.revision(), value.status(),
                        value.medicationCodeSnapshot(), value.medicationNameSnapshot(), value.doseValue(),
                        value.doseUnit(), value.routeCode(), value.frequencyCode(), value.durationValue(),
                        value.durationUnit(), value.quantity(), value.quantityUnit(), value.authoredAt())).toList();
        List<ServiceFact> serviceFacts = services
                .findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(tenantId, encounter.id()).stream()
                .filter(value -> !OMITTED_ORDER_STATUSES.contains(value.status())).limit(50)
                .map(value -> new ServiceFact(value.id(), value.revision(), value.status(),
                        value.serviceTypeSnapshot(), value.itemCodeSnapshot(), value.itemNameSnapshot(),
                        value.quantity(), value.unitCodeSnapshot(), value.reasonText(),
                        value.clinicalDescription(), value.authoredAt())).toList();
        return new EncounterHistorySnapshot(encounter.id(), encounter.revision(), encounter.registeredAt(),
                diagnosisFacts, medicationFacts, serviceFacts);
    }
}
