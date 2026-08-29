package com.rhn.platform.masterdata.api;

import com.rhn.platform.masterdata.api.MasterDataViews.OrganizationAdoptionView;
import com.rhn.platform.masterdata.api.MasterDataViews.PriceView;

import java.time.LocalDate;

/** Public runtime contract for business modules resolving organization adoption and effective price. */
public interface CatalogLifecycleDirectory {
    CatalogOperationalSnapshot resolve(Long tenantId, Long catalogItemId, Long organizationId,
                                       Long packageId, String priceType, LocalDate businessDate);

    MedicationSnapshot requireMedication(Long tenantId, Long medicationId);

    record CatalogOperationalSnapshot(
            Long catalogItemId, Long organizationId, Long packageId, String priceType,
            LocalDate businessDate, CatalogItemSnapshot item, PackageSnapshot itemPackage,
            MedicationSnapshot medication, OrganizationAdoptionView adoption, PriceView price) {}

    /** Immutable catalog definition used by business facts at the resolved business date. */
    record CatalogItemSnapshot(
            Long id, Long itemTypeId, String itemType, Long medicationId,
            String code, String name, String unitCode, boolean orderable, boolean chargeable,
            boolean stocked, String status, LocalDate validFrom, LocalDate validTo,
            String serviceType, String specimenType, String examinationType) {}

    /** Optional package definition when pricing or dispensing is package-specific. */
    record PackageSnapshot(
            Long id, String unitCode, String unitName, String packageSpec,
            java.math.BigDecimal quantityFactor, String usageType, String status,
            LocalDate validFrom, LocalDate validTo) {}

    /** Generic medication knowledge frozen independently from the selected manufacturer product. */
    record MedicationSnapshot(
            Long id, Long itemTypeId, String code, String name, String aliasName,
            String medicationType, String doseForm, String preparationSpec, String preparationUnit,
            java.math.BigDecimal strengthValue, String strengthUnit, String storageType,
            boolean prescriptionDrug, boolean essentialDrug, boolean antimicrobial,
            String antimicrobialLevel, boolean skinTestRequired, java.math.BigDecimal defaultDose,
            String defaultDoseUnit, String defaultRoute, String defaultFrequency,
            boolean chronicDiseaseDrug, boolean singleOrder, String status) {}
}
