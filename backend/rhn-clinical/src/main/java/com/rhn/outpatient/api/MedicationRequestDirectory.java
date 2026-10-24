package com.rhn.outpatient.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;
import com.rhn.platform.masterdata.api.MasterDataDictionaryCodes;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Public, read-only medication-order contract consumed by pharmacy and billing modules. */
public interface MedicationRequestDirectory {
    MedicationRequestSnapshot requireForPharmacy(Long requestId);
    MedicationRequestSnapshot lockForPharmacyIntake(Long requestId);
    MedicationRequestSnapshot requireForRouting(Long tenantId, Long requestId);

    /**
     * 批量读取药房范围的药品请求快照（机构范围校验与 {@link #requireForPharmacy(Long)} 一致），按 id 返回；
     * 默认返回空 Map，调用方逐条回退。
     */
    default Map<Long, MedicationRequestSnapshot> pharmacySnapshots(Collection<Long> requestIds) {
        return Map.of();
    }

    /**
     * 批量读取路由所需快照（与 {@link #requireForRouting(Long, Long)} 同语义），按 id 返回缺失项不包含；
     * 默认返回空 Map，调用方逐条回退。
     */
    default Map<Long, MedicationRequestSnapshot> routingSnapshots(Long tenantId, Collection<Long> requestIds) {
        return Map.of();
    }

    /** 批量筛出已作废(停嘱)的药品请求 id，供药房应退列表避免逐条加载。 */
    Set<Long> cancelledRequestIds(Long tenantId, Collection<Long> requestIds);

    List<MedicationRequestSnapshot> activeForPharmacy(Long organizationId);
    List<MedicationRequestSnapshot> activeForExecution(Long organizationId, Long departmentId);

    record MedicationRequestSnapshot(
            Long id, long revision, Long tenantId, Long residentId, Long encounterId,
            Long prescriptionId, String requestNo, String status,
            Long catalogItemId, Long medicationId, Long packageId,
            Long performerOrganizationId, Long performerDepartmentId, LocalDate businessDate,
            Instant authoredAt, Long authoredBy,
            String itemCode, String itemName, String localCode, String localName,
            String medicationCode, String medicationName,
            @DictionaryBinding(MasterDataDictionaryCodes.MEDICATION_TYPE) String medicationType,
            BigDecimal quantity, String quantityUnit, BigDecimal baseQuantity, String baseUnit,
            BigDecimal packageFactor, boolean substitutionAllowed, boolean selfProvided,
            Long parentRequestId, BigDecimal doseValue, String doseUnit, Long routeId, String routeCode,
            String routeName, String routeExecutionType,
            String frequencyCode, Long frequencyId, String frequencyName, JsonNode frequencyRule,
            BigDecimal durationValue, String durationUnit,
            boolean skinTestRequired, boolean skinTestExempt, String skinTestExemptReason, Long exemptEvidenceEventId,
            Long priceId, Long priceRevision,
            @DictionaryBinding(MasterDataDictionaryCodes.PRICE_TYPE) String priceType,
            BigDecimal unitPrice, BigDecimal priceQuantity, BigDecimal totalAmount, String currencyCode,
            JsonNode medicationSnapshot, JsonNode itemAttributeSnapshot, String itemAttributeHash,
            Instant itemAttributeResolvedAt, JsonNode standardMappings,
            String packageSpec, String manufacturerName, String packageUnitName) {
        /** Linked prescription number; medication lines do not allocate their own business number. */
        @com.fasterxml.jackson.annotation.JsonProperty("prescriptionNo")
        public String prescriptionNo() { return requestNo; }
    }
}
