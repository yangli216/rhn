package com.rhn.platform.masterdata.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class MasterDataViews {
    private MasterDataViews() {}

    public record ItemTypeView(
            Long id, long revision, String scopeType, Long tenantId, Long parentId,
            String code, String name, String description, String subjectType, int sortOrder, String status) {}

    public record LaboratoryServiceView(
            @DictionaryBinding(MasterDataDictionaryCodes.LAB_METHOD) String sdLaboratoryMethod,
            BigDecimal reportDuration, String reportDurationUnit, boolean fastingRequired,
            boolean pointOfCare, String collectionDescription, List<LaboratorySpecimenView> specimens) {}

    public record LaboratorySpecimenView(
            Long id, Long specimenItemId, Long containerItemId, BigDecimal minimumQuantity,
            String minimumQuantityUnit, boolean defaultSpecimen, boolean requiredSpecimen,
            int sortOrder, String collectionDescription, String status) {}

    public record ExaminationServiceView(
            @DictionaryBinding(MasterDataDictionaryCodes.EXAM_TYPE) String sdExaminationType,
            boolean bodySiteRequired, boolean multiBodySite, Integer maxBodySiteCount,
            String preparationDescription, List<ServiceVariantView> variants) {}

    public record ServiceVariantView(
            Long id, Long bodySiteConceptId, String code, String name,
            @DictionaryBinding(MasterDataDictionaryCodes.SERVICE_VARIANT_METHOD) String sdMethodType,
            boolean bodySiteRequired, String mutualRecognitionCode, int sortOrder, String status) {}

    public record ServiceView(
            Long id, long revision, Long itemTypeId, Long itemMasterId, String code, String name, String unitCode,
            boolean orderable, boolean chargeable,
            @DictionaryBinding(MasterDataDictionaryCodes.STATUS) String sdStatus,
            LocalDate validFrom, LocalDate validTo,
            @DictionaryBinding(MasterDataDictionaryCodes.SERVICE_TYPE) String sdServiceType,
            String serviceSubtype,
            @DictionaryBinding(MasterDataDictionaryCodes.SERVICE_USE) String sdUsageType,
            boolean medicalTechnology, boolean combinationItem, boolean singleOrder,
            String specimenType, String examinationType, String accountingCategory,
            @DictionaryBinding(MasterDataDictionaryCodes.SERVICE_DUPLICATE_RULE) String sdDuplicateRule,
            BigDecimal multiSitePrice, Integer freeSiteCount, Integer maxBodySiteCount,
            String mutualRecognitionCode, boolean pregnancyAlert, String attention, String examinationNotes,
            LaboratoryServiceView laboratory, ExaminationServiceView examination,
            OrganizationAdoptionView organizationAdoption, List<PriceView> prices) {}

    public record MedicationView(
            Long id, long revision, Long itemTypeId, Long itemMasterId, String code, String name, String aliasName,
            @DictionaryBinding(MasterDataDictionaryCodes.MEDICATION_TYPE) String sdMedicationType,
            @DictionaryBinding(MasterDataDictionaryCodes.DOSE_FORM) String sdDoseForm,
            String preparationSpec, String preparationUnit, BigDecimal strengthValue, String strengthUnit,
            @DictionaryBinding(MasterDataDictionaryCodes.STORAGE_TYPE) String sdStorageType,
            boolean prescriptionDrug, boolean essentialDrug, boolean antimicrobial,
            @DictionaryBinding(MasterDataDictionaryCodes.ANTIMICROBIAL_LEVEL) String sdAntimicrobialLevel,
            boolean skinTestRequired, BigDecimal defaultDose, String defaultDoseUnit,
            String defaultRoute, Long defaultFrequencyId, String defaultFrequency, boolean chronicDiseaseDrug, boolean singleOrder,
            @DictionaryBinding(MasterDataDictionaryCodes.STATUS) String sdStatus,
            List<MedicationProductView> products) {}

    public record MedicationProductView(
            Long id, long revision, Long itemTypeId, Long itemMasterId,
            Long medicationId, Long manufacturerId, String manufacturerName,
            String code, String name, String unitCode, String tradeName, String approvalCode,
            LocalDate approvalFrom, LocalDate approvalTo, String registrationCode,
            LocalDate registrationFrom, LocalDate registrationTo, String purchaseCode,
            @DictionaryBinding(MasterDataDictionaryCodes.PRODUCT_MARKET_STATUS) String sdMarketStatus,
            @DictionaryBinding(MasterDataDictionaryCodes.PRODUCTION_PLACE) String sdProductionPlace,
            boolean otc, boolean centralPurchase, boolean importAllowed, boolean traceSplitRequired,
            boolean orderable, boolean chargeable, boolean stocked,
            BigDecimal shelfLifeValue,
            @DictionaryBinding(MasterDataDictionaryCodes.SHELF_LIFE_UNIT) String sdShelfLifeUnit,
            @DictionaryBinding(MasterDataDictionaryCodes.STATUS) String sdStatus,
            LocalDate validFrom, LocalDate validTo, String indication, String instruction,
            List<PackageView> packages, OrganizationAdoptionView organizationAdoption,
            List<PriceView> prices) {}

    public record ManufacturerView(
            Long id, long revision, String code, String name, String shortName,
            @DictionaryBinding(MasterDataDictionaryCodes.MANUFACTURER_TYPE) String sdManufacturerType,
            @DictionaryBinding(MasterDataDictionaryCodes.PRODUCTION_PLACE) String sdProductionPlace,
            String countryCode, String address,
            @DictionaryBinding(MasterDataDictionaryCodes.STATUS) String sdStatus) {}

    public record PackageView(
            Long id, Long basePackageId, String unitCode, String unitName, String packageSpec,
            BigDecimal quantityFactor,
            @DictionaryBinding(MasterDataDictionaryCodes.PACKAGE_USE) String sdUsageType,
            String barcode, boolean defaultPurchase, boolean defaultSale, boolean defaultDispense,
            @DictionaryBinding(MasterDataDictionaryCodes.STATUS) String sdStatus,
            LocalDate validFrom, LocalDate validTo) {}

    public record OrganizationAdoptionView(
            Long id, long revision, Long organizationId, Long catalogItemId, Long defaultDepartmentId,
            String localCode, String localName, boolean orderable, boolean executable, boolean chargeable,
            boolean purchasable, boolean stocked, boolean dispensable, boolean returnable,
            @DictionaryBinding(MasterDataDictionaryCodes.STATUS) String sdStatus,
            LocalDate validFrom, LocalDate validTo, Long replacesAdoptionId) {}

    public record PriceView(
            Long id, long revision, Long organizationId, Long packageId,
            @DictionaryBinding(MasterDataDictionaryCodes.PRICE_TYPE) String sdPriceType,
            BigDecimal price, String currencyCode, String priceDocumentCode, String priceReason,
            LocalDate validFrom, LocalDate validTo,
            @DictionaryBinding(MasterDataDictionaryCodes.STATUS) String sdStatus,
            Long replacesPriceId) {}
}
