package com.rhn.platform.masterdata.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class MedicalOperationsViews {
    private MedicalOperationsViews() {}

    public record DictionaryOption(Long id, String code, String name, int sortOrder) {}
    public record LaboratoryProfile(Long serviceId, long revision, String laboratoryMethod,
            BigDecimal reportDuration, String reportDurationUnit, boolean fastingRequired,
            boolean pointOfCare, String collectionDescription, List<SpecimenConfiguration> specimens) {}
    public record SpecimenConfiguration(Long id, long revision, Long specimenItemId, String specimenCode,
            String specimenName, Long containerItemId, String containerCode, String containerName,
            BigDecimal minimumQuantity, String minimumQuantityUnit, boolean defaultSpecimen,
            boolean requiredSpecimen, int sortOrder, String collectionDescription, String status,
            String tubeGroupCode, String tubeSharingMode, int baseTubeCount, Integer maxTestsPerTube,
            String tubeChargeMode, Long tubeChargeItemId, String tubeChargeItemCode,
            String tubeChargeItemName, int includedTubeCount, BigDecimal tubeChargeQuantity) {}
    public record ExaminationProfile(Long serviceId, long revision, String examinationType,
            boolean bodySiteRequired, boolean multiBodySite, Integer maxBodySiteCount,
            String preparationDescription, String sitePricingMode, int includedSiteCount,
            BigDecimal additionalSitePrice, Long additionalSiteItemId,
            String additionalSiteItemCode, String additionalSiteItemName,
            BigDecimal additionalSiteQuantity, Integer maxChargeableSiteCount,
            List<ExaminationVariant> variants, List<ExaminationAttachment> attachments) {}
    public record ExaminationVariant(Long id, long revision, Long bodySiteConceptId, String code,
            String name, String methodType, boolean bodySiteRequired, String mutualRecognitionCode,
            int sortOrder, String status) {}
    public record ExaminationAttachment(Long id, long revision, Long attachmentCatalogItemId,
            String attachmentItemCode, String attachmentItemName, String triggerType,
            String quantityBasis, BigDecimal quantity, boolean requiredAttachment,
            boolean separatelyChargeable, int sortOrder, String description, String status) {}
    public record ClinicalConfiguration(Long serviceId, String serviceCode, String serviceName,
            String serviceType, LaboratoryProfile laboratory, ExaminationProfile examination,
            List<DictionaryOption> specimenOptions, List<DictionaryOption> containerOptions) {}

    public record SupplyView(Long id, long revision, Long itemTypeId, String supplyType, String code,
            String name, String unitCode, boolean orderable, boolean chargeable, boolean stocked,
            String status, LocalDate validFrom, LocalDate validTo, String udiDi, String genericCode,
            String genericName, String modelName, String specification, String materialType,
            String deviceClass, boolean highValue, boolean implant, boolean intervention,
            boolean sterile, boolean singleUse, String registrationCode, String registrationName,
            String registrantName, LocalDate registrationFrom, LocalDate registrationTo,
            Long manufacturerId, String manufacturerName, String structureDescription,
            String scopeDescription, String instruction) {}

    public record GroupMemberView(Long id, Long catalogItemId, String itemCode, String itemName,
            String serviceType, int sortOrder, BigDecimal quantity, String unitCode,
            boolean requiredMember, String memberDescription) {}
    public record ItemGroupView(Long id, long revision, Long organizationId, Long executionDepartmentId,
            String code, String name, String groupType, String usageType, boolean pointOfCare,
            String status, LocalDate validFrom, LocalDate validTo, List<GroupMemberView> members) {}

    public record UnitView(Long id, long revision, String code, String name, String symbol,
            String dimension, int decimalScale, String status) {}
    public record ConversionView(Long id, long revision, Long catalogItemId, String scopeCode,
            Long fromUnitId, String fromUnitCode, Long toUnitId, String toUnitCode,
            BigDecimal factor, BigDecimal offset, LocalDate validFrom, LocalDate validTo, String status) {}
    public record ConversionResult(BigDecimal input, String fromUnitCode, BigDecimal result,
            String toUnitCode, Long catalogItemId, LocalDate effectiveDate, List<String> path) {}

    public record DiagnosticChargeLine(Long catalogItemId, String itemCode, String itemName,
            BigDecimal quantity, String unitCode, String sourceType, boolean separatelyChargeable,
            BigDecimal fixedAmount, String description) {}
    public record ExaminationChargePlan(Long serviceId, int siteCount, String sitePricingMode,
            int includedSiteCount, int extraSiteCount, List<DiagnosticChargeLine> lines) {}
    public record LaboratoryTubeGroup(String groupCode, Long specimenItemId, String specimenCode,
            String specimenName, Long containerItemId, String containerCode, String containerName,
            String sharingMode, int tubeCount, List<Long> serviceIds,
            List<DiagnosticChargeLine> chargeLines) {}
    public record LaboratoryTubePlan(List<LaboratoryTubeGroup> groups,
            List<DiagnosticChargeLine> chargeLines) {}
}
