package com.rhn.platform.masterdata.api;

import com.rhn.platform.masterdata.api.MasterDataViews.OrganizationAdoptionView;
import com.rhn.platform.masterdata.api.MasterDataViews.PriceView;

import java.time.LocalDate;

/** Public runtime contract for business modules resolving organization adoption and effective price. */
public interface CatalogLifecycleDirectory {
    CatalogOperationalSnapshot resolve(Long tenantId, Long catalogItemId, Long organizationId,
                                       Long packageId, String priceType, LocalDate businessDate);

    MedicationSnapshot requireMedication(Long tenantId, Long medicationId);

    java.util.List<MasterDataViews.MedicationView> findMedicationsByProductCatalogItemIds(
            Long tenantId, Long organizationId, java.util.Collection<Long> catalogItemIds);

    PriceView replacePriceVersion(PriceReplacement command);

    record PriceReplacement(Long tenantId, Long currentPriceId, long expectedRevision,
                            Long catalogItemId, Long organizationId, Long packageId,
                            String priceType, java.math.BigDecimal newPrice, String currencyCode,
                            String priceDocumentCode, String reason, LocalDate validFrom) {}

    record CatalogOperationalSnapshot(
            Long catalogItemId, Long organizationId, Long packageId, String priceType,
            LocalDate businessDate, CatalogItemSnapshot item, PackageSnapshot itemPackage,
            MedicationSnapshot medication, OrganizationAdoptionView adoption, PriceView price) {}

    /** Immutable catalog definition used by business facts at the resolved business date. */
    record CatalogItemSnapshot(
            Long id, Long itemTypeId, String itemType, Long medicationId,
            String code, String name, String unitCode, boolean orderable, boolean chargeable,
            boolean stocked, String status, LocalDate validFrom, LocalDate validTo,
            String serviceType, String specimenType, String examinationType,
            Long manufacturerId, String manufacturerName, String accountingCategory) {

        public CatalogItemSnapshot(
                Long id, Long itemTypeId, String itemType, Long medicationId,
                String code, String name, String unitCode, boolean orderable, boolean chargeable,
                boolean stocked, String status, LocalDate validFrom, LocalDate validTo,
                String serviceType, String specimenType, String examinationType,
                Long manufacturerId, String manufacturerName) {
            this(id, itemTypeId, itemType, medicationId, code, name, unitCode, orderable, chargeable,
                    stocked, status, validFrom, validTo, serviceType, specimenType, examinationType,
                    manufacturerId, manufacturerName, null);
        }
    }

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
            String antimicrobialLevel, boolean antimicrobialOutpatientAllowed,
            boolean antimicrobialConsultationRequired, boolean antimicrobialEmergencyAllowed,
            Integer antimicrobialMaxDays, boolean skinTestRequired, String skinTestMethod,
            String skinTestSolutionMode, Integer skinTestObservationMinutes,
            Integer skinTestResultValidityHours, String skinTestInstructions, java.math.BigDecimal defaultDose,
            String defaultDoseUnit, String defaultRoute, Long defaultFrequencyId, String defaultFrequency,
            boolean chronicDiseaseDrug, boolean singleOrder, String status) {}
}
