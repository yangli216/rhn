package com.rhn.outpatient.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class OutpatientPlanTemplateContracts {
    private OutpatientPlanTemplateContracts() {}

    public record SaveRequest(
            @NotBlank @Size(max = 16) String scopeType,
            @NotBlank @Size(max = 100) String name,
            @Size(max = 500) String description,
            Integer sortOrder,
            @Size(max = 32) String sourceType,
            @Size(max = 4000) String guidelineReference,
            @Size(max = 20) List<@Valid DiagnosisInput> diagnoses,
            @Size(max = 50) List<@Valid MedicationInput> medications,
            @Size(max = 50) List<@Valid ServiceInput> services,
            @Size(max = 30) List<@Valid PlanTaskInput> tasks) {
        public SaveRequest(String scopeType, String name, String description, Integer sortOrder,
                           String sourceType, String guidelineReference, List<DiagnosisInput> diagnoses,
                           List<MedicationInput> medications, List<ServiceInput> services) {
            this(scopeType, name, description, sortOrder, sourceType, guidelineReference,
                    diagnoses, medications, services, List.of());
        }
        public SaveRequest(String scopeType, String name, String description, Integer sortOrder,
                           List<DiagnosisInput> diagnoses, List<MedicationInput> medications, List<ServiceInput> services) {
            this(scopeType, name, description, sortOrder, "MANUAL", null, diagnoses, medications, services, List.of());
        }
    }

    public record PlanTaskInput(@NotBlank @Size(max = 24) String kind,
                                @NotBlank @Size(max = 300) String text,
                                @Size(max = 500) String sourceQuote,
                                @NotBlank @Size(max = 24) String origin,
                                @NotBlank @Size(max = 24) String status,
                                @Size(max = 500) String details) {}

    public record DiagnosisInput(
            @NotBlank @Size(max = 64) String code,
            @NotBlank @Size(max = 200) String display,
            @NotBlank @Size(max = 24) String type) {}

    public record MedicationInput(
            @NotNull Long medicationId, Long catalogItemId, Long packageId,
            String medicationName, String preparationSpec,
            @DecimalMin(value = "0", inclusive = false) BigDecimal doseValue,
            @Size(max = 64) String doseUnit, @Size(max = 64) String routeCode,
            @Size(max = 64) String frequencyCode,
            @DecimalMin(value = "0", inclusive = false) BigDecimal durationValue,
            @Size(max = 32) String durationUnit,
            @NotNull @DecimalMin(value = "0", inclusive = false) BigDecimal quantity,
            @Size(max = 64) String quantityUnit, boolean substitutionAllowed, boolean selfProvided,
            @Size(max = 1000) String medicationInstruction, @Size(max = 32) String priceType,
            Boolean pricingRequired, @Size(max = 1000) String reason) {
        public MedicationInput(Long medicationId, Long catalogItemId, Long packageId,
                               BigDecimal doseValue, String doseUnit, String routeCode,
                               String frequencyCode, BigDecimal durationValue, String durationUnit,
                               BigDecimal quantity, String quantityUnit, boolean substitutionAllowed,
                               boolean selfProvided, String medicationInstruction, String priceType,
                               Boolean pricingRequired, String reason) {
            this(medicationId, catalogItemId, packageId, null, null, doseValue, doseUnit, routeCode,
                    frequencyCode, durationValue, durationUnit, quantity, quantityUnit, substitutionAllowed,
                    selfProvided, medicationInstruction, priceType, pricingRequired, reason);
        }
    }

    public record ServiceInput(
            @NotNull Long catalogItemId,
            String itemCode, String itemName, String serviceType,
            @NotNull @DecimalMin(value = "0", inclusive = false) BigDecimal quantity,
            @Size(max = 64) String unitCode, @Size(max = 32) String priceType,
            Boolean pricingRequired, @Size(max = 1000) String reason,
            @Size(max = 2000) String clinicalDescription) {
        public ServiceInput(Long catalogItemId, BigDecimal quantity, String unitCode,
                            String priceType, Boolean pricingRequired, String reason,
                            String clinicalDescription) {
            this(catalogItemId, null, null, null, quantity, unitCode, priceType, pricingRequired, reason, clinicalDescription);
        }
    }

    public record RevisionRequest(@NotNull Long expectedRevision) {}

    public record UpdateRequest(
            @NotNull Long expectedRevision,
            @NotBlank @Size(max = 16) String scopeType,
            @NotBlank @Size(max = 100) String name,
            @Size(max = 500) String description,
            Integer sortOrder,
            @Size(max = 4000) String guidelineReference,
            @Size(max = 20) List<@Valid DiagnosisInput> diagnoses,
            @Size(max = 50) List<@Valid MedicationInput> medications,
            @Size(max = 50) List<@Valid ServiceInput> services,
            @Size(max = 30) List<@Valid PlanTaskInput> tasks) {}

    public record View(Long id, long revision, String scopeType, String name, String description,
                       String status, String sourceType, String guidelineReference,
                       int sortOrder, long useCount, Instant lastUsedAt,
                       List<DiagnosisView> diagnoses, List<MedicationView> medications,
                       List<ServiceView> services, List<PlanTaskInput> tasks,
                       Instant createdAt, Instant updatedAt) {}

    public record DiagnosisView(String code, String display, String type) {}
    public record MedicationView(Long lineId, Long medicationId, Long catalogItemId, Long packageId, String editorMode,
                                 String categoryCode, String medicationCode, String medicationName,
                                 String preparationSpec, String productName, BigDecimal doseValue,
                                 String doseUnit, String routeCode, String routeName,
                                 String routeExecutionType, String frequencyCode,
                                 BigDecimal durationValue, String durationUnit, BigDecimal quantity,
                                 String quantityUnit, boolean substitutionAllowed, boolean selfProvided,
                                 String medicationInstruction, String priceType, boolean pricingRequired,
                                 String reason) {}
    public record ServiceView(Long catalogItemId, String itemCode, String itemName, String serviceType,
                              BigDecimal quantity, String unitCode, String priceType,
                              boolean pricingRequired, String reason, String clinicalDescription) {}
}
