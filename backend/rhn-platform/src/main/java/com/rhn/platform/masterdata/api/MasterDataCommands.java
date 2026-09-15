package com.rhn.platform.masterdata.api;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class MasterDataCommands {
    private MasterDataCommands() {}

    public record ServiceCommand(
            String code, String name, String unitCode, boolean orderable, boolean chargeable,
            String status, LocalDate validFrom, LocalDate validTo, String serviceType,
            String serviceSubtype, String usageType, boolean medicalTechnology,
            boolean combinationItem, boolean singleOrder, String specimenType,
            String examinationType, String accountingCategory, String duplicateRule,
            BigDecimal multiSitePrice, Integer freeSiteCount, Integer maxBodySiteCount,
            String mutualRecognitionCode, boolean pregnancyAlert,
            String attention, String examinationNotes) {}

    public record MedicationCommand(
            String code, String name, String aliasName, String medicationType, String doseForm,
            String preparationSpec, String preparationUnit, BigDecimal strengthValue, String strengthUnit,
            String storageType, boolean prescriptionDrug, boolean essentialDrug, boolean antimicrobial,
            String antimicrobialLevel, Boolean antimicrobialOutpatientAllowed,
            Boolean antimicrobialConsultationRequired, Boolean antimicrobialEmergencyAllowed,
            Integer antimicrobialMaxDays, boolean skinTestRequired, String skinTestMethod,
            String skinTestSolutionMode, Integer skinTestObservationMinutes,
            Integer skinTestResultValidityHours, String skinTestInstructions, BigDecimal defaultDose,
            String defaultDoseUnit, String defaultRoute, String defaultFrequency,
            boolean chronicDiseaseDrug, boolean singleOrder, String status) {}

    public record ManufacturerCommand(
            String code, String name, String shortName, String manufacturerType,
            String productionPlace, String countryCode, String address, String status) {}

    public record ProductCommand(
            Long medicationId, Long manufacturerId, String code, String tradeName,
            String approvalCode, String traceCode, LocalDate approvalFrom, LocalDate approvalTo,
            String registrationCode, LocalDate registrationFrom, LocalDate registrationTo,
            String purchaseCode, String marketStatus, String productionPlace,
            boolean otc, boolean centralPurchase, boolean importAllowed, boolean traceSplitRequired,
            boolean orderable, boolean chargeable, boolean stocked, BigDecimal shelfLifeValue,
            String shelfLifeUnit, String status, LocalDate validFrom, LocalDate validTo,
            String indication, String instruction) {}

    public record PackageCommand(
            Long basePackageId, String unitCode, String unitName, String packageSpec,
            BigDecimal quantityFactor, String usageType, String barcode, boolean defaultPurchase,
            boolean defaultSale, boolean defaultDispense, String status,
            LocalDate validFrom, LocalDate validTo) {}

    public record AdoptionCommand(
            Long organizationId, Long defaultDepartmentId, String localCode, String localName,
            boolean orderable, boolean executable, boolean chargeable, boolean purchasable,
            boolean stocked, boolean dispensable, boolean returnable, String status,
            LocalDate validFrom, LocalDate validTo) {}

    public record PriceCommand(
            Long organizationId, Long packageId, String priceType, BigDecimal price,
            String currencyCode, String priceDocumentCode, String priceReason,
            LocalDate validFrom, LocalDate validTo, String status) {}
}
