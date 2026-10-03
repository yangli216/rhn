package com.rhn.outpatient.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;
import com.rhn.platform.masterdata.api.MasterDataDictionaryCodes;

import java.math.BigDecimal;
import java.util.List;

/** Read-only projection of currently visible outpatient plan templates for decision-support consumers. */
public interface OutpatientPlanTemplateDirectory {
    List<PlanTemplateSnapshot> visibleForCurrentContext();
    List<PlanTemplateSnapshot> searchIndexForCurrentContext();
    List<PlanTemplateSnapshot> visibleByIds(List<Long> ids);

    record PlanTemplateSnapshot(Long id, long revision, String scopeType, String sourceType,
                                String guidelineReference, String name, String description, long useCount,
                                List<DiagnosisSnapshot> diagnoses,
                                List<MedicationSnapshot> medications,
                                List<ServiceSnapshot> services,
                                List<OutpatientPlanTemplateContracts.PlanTaskInput> tasks,
                                PlanSearchProfile searchProfile) {
        public PlanTemplateSnapshot(Long id, long revision, String scopeType, String sourceType,
                                    String guidelineReference, String name, String description, long useCount,
                                    List<DiagnosisSnapshot> diagnoses, List<MedicationSnapshot> medications,
                                    List<ServiceSnapshot> services, List<OutpatientPlanTemplateContracts.PlanTaskInput> tasks) {
            this(id, revision, scopeType, sourceType, guidelineReference, name, description, useCount,
                    diagnoses, medications, services, tasks, null);
        }
        public PlanTemplateSnapshot {
            diagnoses = diagnoses == null ? List.of() : List.copyOf(diagnoses);
            medications = medications == null ? List.of() : List.copyOf(medications);
            services = services == null ? List.of() : List.copyOf(services);
            tasks = tasks == null ? List.of() : List.copyOf(tasks);
        }

        public PlanTemplateSnapshot(Long id, long revision, String scopeType, String sourceType,
                                    String guidelineReference, String name, String description, long useCount,
                                    List<DiagnosisSnapshot> diagnoses, List<MedicationSnapshot> medications,
                                    List<ServiceSnapshot> services) {
            this(id, revision, scopeType, sourceType, guidelineReference, name, description, useCount,
                    diagnoses, medications, services, List.of());
        }

        public PlanTemplateSnapshot(Long id, long revision, String name, String description, long useCount,
                                    List<DiagnosisSnapshot> diagnoses,
                                    List<MedicationSnapshot> medications,
                                    List<ServiceSnapshot> services) {
            this(id, revision, "PERSONAL", "MANUAL", null, name, description, useCount,
                    diagnoses, medications, services, List.of());
        }
    }

    @io.swagger.v3.oas.annotations.media.Schema(name = "PlanSearchDiagnosis")
    record DiagnosisSnapshot(String codeSystem,
                             @DictionaryBinding("BD_DIAGNOSIS_DOMAIN") String diagnosisDomain,
                             String code, String display, String type) {
        public DiagnosisSnapshot(String code, String display, String type) {
            this("WHO.BD.CS.ICD10", "WESTERN_MEDICINE", code, display, type);
        }
    }

    record MedicationSnapshot(Long lineId, Long medicationId, Long catalogItemId, Long packageId,
                              String categoryCode, String medicationCode, String medicationName,
                              String preparationSpec, String productName,
                              BigDecimal doseValue, String doseUnit, String routeCode,
                              String frequencyCode, BigDecimal durationValue, String durationUnit,
                              BigDecimal quantity, String quantityUnit, String medicationInstruction,
                              boolean substitutionAllowed, boolean selfProvided,
                              @DictionaryBinding(MasterDataDictionaryCodes.PRICE_TYPE) String priceType,
                              boolean pricingRequired, String reason) {}

    record ServiceSnapshot(Long catalogItemId, String itemCode, String itemName,
                           @DictionaryBinding(MasterDataDictionaryCodes.SERVICE_TYPE) String serviceType,
                           BigDecimal quantity, String unitCode,
                           @DictionaryBinding(MasterDataDictionaryCodes.PRICE_TYPE) String priceType,
                           boolean pricingRequired, String reason,
                           String clinicalDescription) {}
}
