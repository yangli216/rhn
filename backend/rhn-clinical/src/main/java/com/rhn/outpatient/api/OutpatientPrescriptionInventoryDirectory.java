package com.rhn.outpatient.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;
import com.rhn.platform.masterdata.api.MasterDataDictionaryCodes;
import com.rhn.platform.masterdata.api.MasterDataViews.MedicationProductView;

import java.math.BigDecimal;
import java.util.List;

/**
 * 门诊处方开立专属药房库存协同接口。
 * 提供就诊科室路由解析、有库存开药目录检索、处方开立前置冻结及撤销释放。
 */
public interface OutpatientPrescriptionInventoryDirectory {

    /**
     * 根据当前门诊就诊科室路由的发药药房，检索有效且有可用库存（quantityAvailable > 0）的开方药品。
     */
    List<OrderableMedicationView> findOrderableMedications(Long tenantId, Long organizationId, Long departmentId, String query);

    /** Exact, read-only availability at the pharmacy selected by the current outpatient routing rules. */
    MedicationAvailabilityView inspectMedicationAvailability(Long tenantId, Long organizationId, Long departmentId,
                                                              Long catalogItemId, Long packageId);

    /**
     * 门诊处方提交时，针对路由药房执行库存预留冻结。
     */
    PrescriptionFreezeResult freezePrescription(PrescriptionFreezeCommand command);

    /**
     * 门诊处方作废或撤销时，释放已冻结的库存。
     */
    void releasePrescription(PrescriptionReleaseCommand command);

    record OrderableMedicationView(
            Long id,
            Long revision,
            Long itemTypeId,
            Long itemMasterId,
            String code,
            String name,
            String aliasName,
            @DictionaryBinding(MasterDataDictionaryCodes.MEDICATION_TYPE) String sdMedicationType,
            @DictionaryBinding(MasterDataDictionaryCodes.DOSE_FORM) String sdDoseForm,
            String preparationSpec,
            String preparationUnit,
            BigDecimal strengthValue,
            String strengthUnit,
            @DictionaryBinding(MasterDataDictionaryCodes.STORAGE_TYPE) String sdStorageType,
            boolean prescriptionDrug,
            boolean essentialDrug,
            boolean antimicrobial,
            @DictionaryBinding(MasterDataDictionaryCodes.ANTIMICROBIAL_LEVEL) String sdAntimicrobialLevel,
            boolean skinTestRequired,
            BigDecimal defaultDose,
            String defaultDoseUnit,
            String defaultRoute,
            Long defaultFrequencyId,
            String defaultFrequency,
            boolean chronicDiseaseDrug,
            boolean singleOrder,
            @DictionaryBinding(MasterDataDictionaryCodes.STATUS) String sdStatus,
            Long stockSiteId,
            String stockSiteName,
            Long stockItemId,
            BigDecimal availableBaseQuantity,
            BigDecimal availablePackageQuantity,
            String baseUnitCode,
            String packageUnitName,
            BigDecimal packageFactor,
            List<MedicationProductView> products
    ) {}

    record MedicationAvailabilityView(
            boolean routeConfigured,
            Long stockSiteId,
            String stockSiteName,
            boolean stockItemConfigured,
            Long stockItemId,
            Long effectivePackageId,
            String packageUnitCode,
            BigDecimal packageFactor,
            BigDecimal availableBaseQuantity,
            BigDecimal availablePackageQuantity
    ) {}

    record PrescriptionFreezeCommand(
            Long tenantId,
            Long organizationId,
            Long departmentId,
            Long encounterId,
            Long prescriptionId,
            List<PrescriptionItemFreezeRequest> items,
            Long actorId
    ) {}

    record PrescriptionItemFreezeRequest(
            Long requestId,
            Long catalogItemId,
            Long packageId,
            BigDecimal packageQuantity,
            String unitName
    ) {}

    record PrescriptionFreezeResult(
            Long prescriptionId,
            String reservationGroupCode,
            int totalItemsFrozen,
            boolean success
    ) {}

    record PrescriptionReleaseCommand(
            Long tenantId,
            Long encounterId,
            Long prescriptionId,
            String reason,
            Long actorId
    ) {}
}
