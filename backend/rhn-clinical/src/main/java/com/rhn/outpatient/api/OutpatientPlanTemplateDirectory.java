package com.rhn.outpatient.api;

import java.math.BigDecimal;
import java.util.List;

/** Read-only projection of currently visible outpatient plan templates for decision-support consumers. */
public interface OutpatientPlanTemplateDirectory {
    List<PlanTemplateSnapshot> visibleForCurrentContext();

    record PlanTemplateSnapshot(Long id, long revision, String scopeType, String sourceType,
                                String guidelineReference, String name, String description, long useCount,
                                List<DiagnosisSnapshot> diagnoses,
                                List<MedicationSnapshot> medications,
                                List<ServiceSnapshot> services) {
        public PlanTemplateSnapshot {
            diagnoses = diagnoses == null ? List.of() : List.copyOf(diagnoses);
            medications = medications == null ? List.of() : List.copyOf(medications);
            services = services == null ? List.of() : List.copyOf(services);
        }

        public PlanTemplateSnapshot(Long id, long revision, String name, String description, long useCount,
                                    List<DiagnosisSnapshot> diagnoses,
                                    List<MedicationSnapshot> medications,
                                    List<ServiceSnapshot> services) {
            this(id, revision, "PERSONAL", "MANUAL", null, name, description, useCount,
                    diagnoses, medications, services);
        }
    }

    record DiagnosisSnapshot(String code, String display, String type) {}

    record MedicationSnapshot(Long lineId, Long medicationId, Long catalogItemId, Long packageId,
                              String categoryCode, String medicationCode, String medicationName,
                              String preparationSpec, String productName,
                              BigDecimal doseValue, String doseUnit, String routeCode,
                              String frequencyCode, BigDecimal durationValue, String durationUnit,
                              BigDecimal quantity, String quantityUnit, String medicationInstruction,
                              boolean selfProvided, String priceType, boolean pricingRequired, String reason) {}

    record ServiceSnapshot(Long catalogItemId, String itemCode, String itemName, String serviceType,
                           BigDecimal quantity, String unitCode, String reason,
                           String clinicalDescription) {}
}
