package com.rhn.outpatient.api;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/** V2 includes saved QMED-0 semantics inside medicationSnapshot; historical items remain LEGACY. */
public record PrescriptionSafetySnapshot(
        String schemaVersion, Long tenantId, Long prescriptionId, long prescriptionRevision,
        Long encounterId, Long residentId, Long organizationId, Long departmentId,
        String prescriptionStatus, List<MedicationItem> medications) {
    public static final String SCHEMA_VERSION = "qmed-prescription-v2";

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

    public record MedicationItem(
            Long medicationRequestId, long revision, Long medicationId, Long productId, Long parentRequestId,
            String status, String semanticStatus, BigDecimal doseValue, String doseUnit,
            Long routeId, String routeCode, String routeExecutionType, String routeResolutionStatus,
            Long frequencyId, String frequencyCode, String frequencyRuleSnapshot,
            BigDecimal durationValue, String durationUnit, String medicationSnapshot,
            String itemAttributeSnapshot, String standardMappingSnapshot) {
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
