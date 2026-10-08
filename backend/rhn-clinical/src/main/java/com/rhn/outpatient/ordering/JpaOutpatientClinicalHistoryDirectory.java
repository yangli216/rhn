package com.rhn.outpatient.ordering;

import com.rhn.healthcore.api.EncounterDiagnosisDirectory;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.OutpatientClinicalHistoryDirectory;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Component
class JpaOutpatientClinicalHistoryDirectory implements OutpatientClinicalHistoryDirectory {

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
        return encounters.recentCompletedForResident(residentId, currentEncounterId, since, limit).stream()
                .map(value -> snapshot(context.tenantId(), value))
                .toList();
    }

    private EncounterHistorySnapshot snapshot(Long tenantId, EncounterDirectory.EncounterSnapshot encounter) {
        List<DiagnosisFact> diagnosisFacts = diagnoses.findActiveDiagnoses(tenantId, encounter.id(), "ENCOUNTER")
                .stream().map(value -> new DiagnosisFact(value.id(), value.code(), value.display(),
                        value.diagnosisType())).toList();
        List<MedicationFact> medicationFacts = medications
                .findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(tenantId, encounter.id()).stream()
                .filter(value -> value.status() == MedicationRequestStatus.ACTIVE)
                .map(value -> new MedicationFact(value.id(), value.revision(), value.status().name(),
                        value.medicationCodeSnapshot(), value.medicationNameSnapshot(), value.doseValue(),
                        value.doseUnit(), value.routeCode(), value.frequencyCode(), value.durationValue(),
                        value.durationUnit(), value.quantity(), value.quantityUnit(), value.authoredAt(),
                        new MedicationCatalogFact(value.medicationId(), value.catalogItemId(), value.packageId(),
                                value.preparationSpecSnapshot(), value.preparationUnitSnapshot(), value.baseQuantity(),
                                value.baseUnit(), value.packageFactorSnapshot(), value.packageUnitNameSnapshot(),
                                value.packageSpecSnapshot(), value.substitutionAllowed(), value.selfProvided(),
                                value.priceType(), value.medicationInstruction()),
                        new MedicationUsageFact(value.routeId(), value.routeExecutionTypeSnapshot(), value.routeResolutionStatus(),
                                value.frequencyId(), value.frequencyRuleSnapshot()))).toList();
        List<ServiceFact> serviceFacts = services
                .findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(tenantId, encounter.id()).stream()
                .filter(value -> value.status() == ServiceRequestStatus.ACTIVE)
                .map(value -> new ServiceFact(value.id(), value.revision(), value.status().name(),
                        value.serviceTypeSnapshot(), value.itemCodeSnapshot(), value.itemNameSnapshot(),
                        value.quantity(), value.unitCodeSnapshot(), value.reasonText(),
                        value.clinicalDescription(), value.authoredAt())).toList();
        return new EncounterHistorySnapshot(encounter.id(), encounter.revision(), encounter.registeredAt(),
                diagnosisFacts, medicationFacts, serviceFacts);
    }
}
