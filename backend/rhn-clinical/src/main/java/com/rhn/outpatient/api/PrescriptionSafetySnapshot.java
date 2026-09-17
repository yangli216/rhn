package com.rhn.outpatient.api;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/** V1 carries saved clinical values. LEGACY explicitly means canonical semantic versions are not yet available. */
public record PrescriptionSafetySnapshot(
        String schemaVersion, Long tenantId, Long prescriptionId, long prescriptionRevision,
        Long encounterId, Long residentId, Long organizationId, Long departmentId,
        String prescriptionStatus, List<MedicationItem> medications,
        PatientSafetyContext patientContext) {
    public static final String SCHEMA_VERSION = "qmed-prescription-v1";

    public PrescriptionSafetySnapshot(
            String schemaVersion, Long tenantId, Long prescriptionId, long prescriptionRevision,
            Long encounterId, Long residentId, Long organizationId, Long departmentId,
            String prescriptionStatus, List<MedicationItem> medications) {
        this(schemaVersion, tenantId, prescriptionId, prescriptionRevision, encounterId, residentId,
                organizationId, departmentId, prescriptionStatus, medications, null);
    }

    public PrescriptionSafetySnapshot {
        Objects.requireNonNull(schemaVersion, "schemaVersion");
        for (Long id : new Long[]{tenantId, prescriptionId, encounterId, residentId, organizationId, departmentId}) {
            if (id == null || id <= 0) throw new IllegalArgumentException("Snapshot identifiers must be positive");
        }
        if (prescriptionRevision < 0) throw new IllegalArgumentException("Negative prescription revision");
        Objects.requireNonNull(prescriptionStatus, "prescriptionStatus");
        medications = List.copyOf(medications).stream()
                .sorted(Comparator.comparing(MedicationItem::medicationRequestId)).toList();
        if (medications.stream().map(MedicationItem::medicationRequestId).distinct().count() != medications.size()) {
            throw new IllegalArgumentException("Duplicate medication request identifiers");
        }
    }

    public record PatientSafetyContext(
            boolean allergyStatusRecorded,
            boolean allergyReviewConfirmed,
            String allergyOverrideReason,
            List<AllergyFact> activeAllergies,
            Integer patientAgeYears,
            String gender) {
        public PatientSafetyContext(
                boolean allergyStatusRecorded,
                boolean allergyReviewConfirmed,
                String allergyOverrideReason,
                List<AllergyFact> activeAllergies) {
            this(allergyStatusRecorded, allergyReviewConfirmed, allergyOverrideReason, activeAllergies, null, null);
        }

        public PatientSafetyContext {
            activeAllergies = activeAllergies == null ? List.of() : List.copyOf(activeAllergies);
        }
    }

    public record AllergyFact(
            Long allergenId,
            String substanceCode,
            String substanceName,
            String allergenDisplay,
            String assertionType) {}

    public record MedicationItem(
            Long medicationRequestId, long revision, Long medicationId, Long productId, Long parentRequestId,
            String status, String semanticStatus, BigDecimal doseValue, String doseUnit,
            Long routeId, String routeCode, String routeExecutionType, String routeResolutionStatus,
            Long frequencyId, String frequencyCode, String frequencyRuleSnapshot,
            BigDecimal durationValue, String durationUnit, String medicationSnapshot,
            String itemAttributeSnapshot, String standardMappingSnapshot,
            boolean skinTestExempt, String skinTestExemptReason, Long exemptEvidenceEventId) {

        public MedicationItem(
                Long medicationRequestId, long revision, Long medicationId, Long productId, Long parentRequestId,
                String status, String semanticStatus, BigDecimal doseValue, String doseUnit,
                Long routeId, String routeCode, String routeExecutionType, String routeResolutionStatus,
                Long frequencyId, String frequencyCode, String frequencyRuleSnapshot,
                BigDecimal durationValue, String durationUnit, String medicationSnapshot,
                String itemAttributeSnapshot, String standardMappingSnapshot) {
            this(medicationRequestId, revision, medicationId, productId, parentRequestId, status, semanticStatus,
                    doseValue, doseUnit, routeId, routeCode, routeExecutionType, routeResolutionStatus,
                    frequencyId, frequencyCode, frequencyRuleSnapshot, durationValue, durationUnit, medicationSnapshot,
                    itemAttributeSnapshot, standardMappingSnapshot, false, null, null);
        }

        public MedicationItem {
            if (medicationRequestId == null || medicationRequestId <= 0 || revision < 0) {
                throw new IllegalArgumentException("Invalid medication request identity");
            }
            if (medicationId != null && medicationId <= 0) throw new IllegalArgumentException("Invalid medication identity");
            Objects.requireNonNull(status, "status");
            Objects.requireNonNull(semanticStatus, "semanticStatus");
            doseValue = doseValue == null ? null : doseValue.stripTrailingZeros();
            durationValue = durationValue == null ? null : durationValue.stripTrailingZeros();
        }

        public boolean activeForEvaluation() {
            return "DRAFT".equals(status) || "ACTIVE".equals(status);
        }
    }
}
