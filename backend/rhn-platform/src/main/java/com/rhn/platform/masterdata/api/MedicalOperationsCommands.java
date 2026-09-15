package com.rhn.platform.masterdata.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class MedicalOperationsCommands {
    private MedicalOperationsCommands() {}
    public record LaboratoryProfileCommand(String laboratoryMethod, BigDecimal reportDuration,
            String reportDurationUnit, boolean fastingRequired, boolean pointOfCare,
            String collectionDescription) {}
    public record SpecimenCommand(Long specimenItemId, Long containerItemId, BigDecimal minimumQuantity,
            String minimumQuantityUnit, boolean defaultSpecimen, boolean requiredSpecimen,
            int sortOrder, String collectionDescription, String status, String tubeGroupCode,
            String tubeSharingMode, int baseTubeCount, Integer maxTestsPerTube,
            String tubeChargeMode, Long tubeChargeItemId, int includedTubeCount,
            BigDecimal tubeChargeQuantity) {}
    public record ExaminationProfileCommand(String examinationType, boolean bodySiteRequired,
            boolean multiBodySite, Integer maxBodySiteCount, String preparationDescription,
            String sitePricingMode, Integer includedSiteCount, BigDecimal additionalSitePrice,
            Long additionalSiteItemId, BigDecimal additionalSiteQuantity,
            Integer maxChargeableSiteCount) {}
    public record ExaminationVariantCommand(Long bodySiteConceptId, String code, String name,
            String methodType, boolean bodySiteRequired, String mutualRecognitionCode,
            int sortOrder, String status) {}
    public record ExaminationAttachmentCommand(Long attachmentCatalogItemId, String triggerType,
            String quantityBasis, BigDecimal quantity, boolean requiredAttachment,
            boolean separatelyChargeable, int sortOrder, String description, String status) {}
    public record LaboratoryOrderItemCommand(Long serviceId, Long specimenConfigurationId, int quantity) {}
    public record SupplyCommand(String supplyType, String code, String name, String unitCode,
            boolean orderable, boolean chargeable, boolean stocked, String status,
            LocalDate validFrom, LocalDate validTo, String udiDi, String genericCode,
            String genericName, String modelName, String specification, String materialType,
            String deviceClass, boolean highValue, boolean implant, boolean intervention,
            boolean sterile, boolean singleUse, String registrationCode, String registrationName,
            String registrantName, LocalDate registrationFrom, LocalDate registrationTo,
            Long manufacturerId, String structureDescription, String scopeDescription, String instruction) {}
    public record GroupMemberCommand(Long catalogItemId, int sortOrder, BigDecimal quantity,
            String unitCode, boolean requiredMember, String memberDescription) {}
    public record ItemGroupCommand(Long organizationId, Long executionDepartmentId, String code,
            String name, String groupType, String usageType, boolean pointOfCare, String status,
            LocalDate validFrom, LocalDate validTo, List<GroupMemberCommand> members) {}
    public record UnitCommand(String code, String name, String symbol, String dimension,
            int decimalScale, String status) {}
    public record ConversionCommand(Long catalogItemId, String fromUnitCode, String toUnitCode,
            BigDecimal factor, BigDecimal offset, LocalDate validFrom, LocalDate validTo, String status) {}
}
