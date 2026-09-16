package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.outpatient.api.PrescriptionSafetySnapshotDirectory;
import org.springframework.stereotype.Service;
import com.rhn.shared.json.JsonCodec;
import org.springframework.transaction.annotation.Transactional;

import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class PrescriptionSafetySnapshotService implements PrescriptionSafetySnapshotDirectory {
    private final EncounterDirectory encounters;
    private final PrescriptionRepository prescriptions;
    private final MedicationRequestRepository medications;
    private final JsonCodec json;

    PrescriptionSafetySnapshotService(EncounterDirectory encounters, PrescriptionRepository prescriptions,
                                      MedicationRequestRepository medications, JsonCodec json) {
        this.json = json;
        this.encounters = encounters;
        this.prescriptions = prescriptions;
        this.medications = medications;
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
                        value.status(), semanticStatus(value.medicationSnapshot()), value.doseValue(), value.doseUnit(), value.routeId(), value.routeCode(),
                        value.routeExecutionTypeSnapshot(), value.routeResolutionStatus(), value.frequencyId(),
                        value.frequencyCode(), value.frequencyRuleSnapshot(), value.durationValue(), value.durationUnit(),
                        value.medicationSnapshot(), value.itemAttributeSnapshot(), value.standardMappingSnapshot())).toList();
        return new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, encounter.tenantId(),
                prescriptionId, prescription.revision(), encounterId, encounter.residentId(),
                encounter.organizationId(), encounter.departmentId(), prescription.status(), items);
    }
    private String semanticStatus(String saved) {
        if (saved == null) return "LEGACY";
        try {
            var semantic = json.readTree(saved).path("clinicalSemantics");
            if (semantic.isMissingNode() || semantic.isNull()) return "LEGACY";
            String status = semantic.path("status").asString();
            return "qmed-medication-semantics-v1".equals(semantic.path("schemaVersion").asString())
                    && semantic.path("medicationSemanticVersion").asString().matches("[a-f0-9]{64}")
                    && java.util.Set.of("VERSIONED", "VERSIONED_PARTIAL").contains(status) ? status : "UNKNOWN";
        } catch (RuntimeException unreadable) {
            return "UNKNOWN";
        }
    }

}
