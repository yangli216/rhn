package com.rhn.outpatient.ordering;

import com.rhn.healthcore.api.AllergyDirectory;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.outpatient.api.PrescriptionSafetySnapshotDirectory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class PrescriptionSafetySnapshotService implements PrescriptionSafetySnapshotDirectory {
    private final EncounterDirectory encounters;
    private final PrescriptionRepository prescriptions;
    private final MedicationRequestRepository medications;
    private final AllergyDirectory allergies;
    private final com.rhn.healthcore.api.ResidentDirectory residents;

    @Autowired
    PrescriptionSafetySnapshotService(EncounterDirectory encounters, PrescriptionRepository prescriptions,
                                      MedicationRequestRepository medications,
                                      @Autowired(required = false) AllergyDirectory allergies,
                                      @Autowired(required = false) com.rhn.healthcore.api.ResidentDirectory residents) {
        this.encounters = encounters;
        this.prescriptions = prescriptions;
        this.medications = medications;
        this.allergies = allergies;
        this.residents = residents;
    }

    PrescriptionSafetySnapshotService(EncounterDirectory encounters, PrescriptionRepository prescriptions,
                                      MedicationRequestRepository medications) {
        this(encounters, prescriptions, medications, null, null);
    }

    @Override
    @Transactional(readOnly = true)
    public PrescriptionSafetySnapshot requireSnapshot(Long encounterId, Long prescriptionId) {
        var encounter = encounters.requireAccessible(encounterId);
        var prescription = prescriptions.findByIdAndTenantId(prescriptionId, encounter.tenantId())
                .filter(value -> encounterId.equals(value.encounterId()))
                .orElseThrow(() -> notFound("PRESCRIPTION_NOT_FOUND", "未找到当前就诊的处方"));
        var items = medications.findByTenantIdAndRequestGroupIdOrderByAuthoredAt(encounter.tenantId(), prescriptionId)
                .stream().map(value -> new PrescriptionSafetySnapshot.MedicationItem(
                        value.id(), value.revision(), value.medicationId(), value.catalogItemId(), value.parentRequestId(),
                        value.status(), "LEGACY", value.doseValue(), value.doseUnit(), value.routeId(), value.routeCode(),
                        value.routeExecutionTypeSnapshot(), value.routeResolutionStatus(), value.frequencyId(),
                        value.frequencyCode(), value.frequencyRuleSnapshot(), value.durationValue(), value.durationUnit(),
                        value.medicationSnapshot(), value.itemAttributeSnapshot(), value.standardMappingSnapshot(),
                        value.skinTestExempt(), value.skinTestExemptReason(), value.exemptEvidenceEventId())).toList();

        Integer ageYears = null;
        String gender = null;
        if (residents != null && encounter.residentId() != null) {
            try {
                var resident = residents.requireSnapshot(encounter.tenantId(), encounter.residentId());
                if (resident != null) {
                    gender = resident.gender();
                    if (resident.birthDate() != null) {
                        ageYears = java.time.Period.between(resident.birthDate(), java.time.LocalDate.now()).getYears();
                    }
                }
            } catch (RuntimeException ex) {
                // fall back gracefully
            }
        }

        PrescriptionSafetySnapshot.PatientSafetyContext patientContext = null;
        if (allergies != null && encounter.residentId() != null) {
            var active = allergies.activeForResident(encounter.residentId());
            boolean recorded = active.stream().anyMatch(a ->
                    "NO_KNOWN_ALLERGY".equals(a.assertionType()) || "NO_KNOWN_DRUG_ALLERGY".equals(a.assertionType()))
                    || active.stream().anyMatch(AllergyDirectory.AllergySnapshot::isDrugAllergy);
            var drugAllergies = active.stream().filter(AllergyDirectory.AllergySnapshot::isDrugAllergy)
                    .map(a -> new PrescriptionSafetySnapshot.AllergyFact(
                            a.allergenId(), a.substanceCode(), a.substanceDisplay(), a.substanceDisplay(), a.assertionType()))
                    .toList();
            patientContext = new PrescriptionSafetySnapshot.PatientSafetyContext(
                    recorded, false, null, drugAllergies, ageYears, gender);
        } else if (ageYears != null || gender != null) {
            patientContext = new PrescriptionSafetySnapshot.PatientSafetyContext(
                    false, false, null, java.util.List.of(), ageYears, gender);
        }

        return new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, encounter.tenantId(),
                prescriptionId, prescription.revision(), encounterId, encounter.residentId(),
                encounter.organizationId(), encounter.departmentId(), prescription.status(), items, patientContext);
    }
}
