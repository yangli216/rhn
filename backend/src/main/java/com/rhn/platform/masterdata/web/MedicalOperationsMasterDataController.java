package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.MedicalOperationsCommands.*;
import com.rhn.platform.masterdata.api.MedicalOperationsViews.*;
import com.rhn.platform.masterdata.application.MedicalOperationsMasterDataService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/platform/master-data/operations")
public class MedicalOperationsMasterDataController {
    private static final String CODE_PATTERN = "[A-Za-z][A-Za-z0-9_.-]{0,63}";
    private final MedicalOperationsMasterDataService service;

    public MedicalOperationsMasterDataController(MedicalOperationsMasterDataService service) {
        this.service = service;
    }

    @GetMapping("/services/{serviceId}/clinical-configuration")
    ClinicalConfiguration configuration(@PathVariable Long serviceId) {
        return service.clinicalConfiguration(serviceId);
    }

    @PutMapping("/services/{serviceId}/laboratory-profile")
    ClinicalConfiguration laboratoryProfile(@PathVariable Long serviceId,
            @Valid @RequestBody LaboratoryProfileRequest request) {
        return service.updateLaboratoryProfile(serviceId, revision(request.expectedRevision()), request.command());
    }

    @PostMapping("/services/{serviceId}/specimens")
    @ResponseStatus(HttpStatus.CREATED)
    ClinicalConfiguration createSpecimen(@PathVariable Long serviceId, @Valid @RequestBody SpecimenRequest request) {
        return service.createSpecimen(serviceId, request.command());
    }

    @PutMapping("/services/{serviceId}/specimens/{specimenId}")
    ClinicalConfiguration updateSpecimen(@PathVariable Long serviceId, @PathVariable Long specimenId,
            @Valid @RequestBody UpdateSpecimenRequest request) {
        return service.updateSpecimen(serviceId, specimenId, revision(request.expectedRevision()), request.command());
    }

    @PostMapping("/services/{serviceId}/specimens/{specimenId}/status")
    ClinicalConfiguration specimenStatus(@PathVariable Long serviceId, @PathVariable Long specimenId,
            @Valid @RequestBody StatusRequest request) {
        return service.changeSpecimenStatus(serviceId, specimenId, revision(request.expectedRevision()), request.status());
    }

    @PutMapping("/services/{serviceId}/examination-profile")
    ClinicalConfiguration examinationProfile(@PathVariable Long serviceId,
            @Valid @RequestBody ExaminationProfileRequest request) {
        return service.updateExaminationProfile(serviceId, revision(request.expectedRevision()), request.command());
    }

    @PostMapping("/services/{serviceId}/examination-variants")
    @ResponseStatus(HttpStatus.CREATED)
    ClinicalConfiguration createVariant(@PathVariable Long serviceId, @Valid @RequestBody VariantRequest request) {
        return service.createVariant(serviceId, request.command());
    }

    @PutMapping("/services/{serviceId}/examination-variants/{variantId}")
    ClinicalConfiguration updateVariant(@PathVariable Long serviceId, @PathVariable Long variantId,
            @Valid @RequestBody UpdateVariantRequest request) {
        return service.updateVariant(serviceId, variantId, revision(request.expectedRevision()), request.command());
    }

    @PostMapping("/services/{serviceId}/examination-attachments")
    @ResponseStatus(HttpStatus.CREATED)
    ClinicalConfiguration createAttachment(@PathVariable Long serviceId,
            @Valid @RequestBody AttachmentRequest request) {
        return service.createAttachment(serviceId, request.command());
    }

    @PutMapping("/services/{serviceId}/examination-attachments/{attachmentId}")
    ClinicalConfiguration updateAttachment(@PathVariable Long serviceId, @PathVariable Long attachmentId,
            @Valid @RequestBody UpdateAttachmentRequest request) {
        return service.updateAttachment(serviceId, attachmentId, revision(request.expectedRevision()), request.command());
    }

    @PostMapping("/services/{serviceId}/examination-charge-plan")
    ExaminationChargePlan examinationChargePlan(@PathVariable Long serviceId,
            @Valid @RequestBody ExaminationChargePlanRequest request) {
        return service.examinationChargePlan(serviceId, request.bodySiteCodes(), request.selectedAttachmentIds());
    }

    @PostMapping("/laboratory-tube-plan")
    LaboratoryTubePlan laboratoryTubePlan(@Valid @RequestBody LaboratoryTubePlanRequest request) {
        return service.laboratoryTubePlan(request.items().stream().map(LaboratoryOrderItemRequest::command).toList());
    }

    @GetMapping("/supplies")
    List<SupplyView> supplies(@RequestParam(required = false) String query,
            @RequestParam(required = false) String status, @RequestParam(required = false) String supplyType) {
        return service.supplies(query, status, supplyType);
    }

    @PostMapping("/supplies")
    @ResponseStatus(HttpStatus.CREATED)
    SupplyView createSupply(@Valid @RequestBody SupplyRequest request) { return service.createSupply(request.command()); }

    @PutMapping("/supplies/{id}")
    SupplyView updateSupply(@PathVariable Long id, @Valid @RequestBody UpdateSupplyRequest request) {
        return service.updateSupply(id, revision(request.expectedRevision()), request.command());
    }

    @GetMapping("/item-groups")
    List<ItemGroupView> groups(@RequestParam(required = false) String query,
            @RequestParam(required = false) String groupType, @RequestParam(required = false) String status) {
        return service.groups(query, groupType, status);
    }

    @PostMapping("/item-groups")
    @ResponseStatus(HttpStatus.CREATED)
    ItemGroupView createGroup(@Valid @RequestBody ItemGroupRequest request) { return service.createGroup(request.command()); }

    @PutMapping("/item-groups/{id}")
    ItemGroupView updateGroup(@PathVariable Long id, @Valid @RequestBody UpdateItemGroupRequest request) {
        return service.updateGroup(id, revision(request.expectedRevision()), request.command());
    }

    @GetMapping("/units")
    List<UnitView> units(@RequestParam(required = false) String dimension,
            @RequestParam(required = false) String status) { return service.units(dimension, status); }

    @PostMapping("/units")
    @ResponseStatus(HttpStatus.CREATED)
    UnitView createUnit(@Valid @RequestBody UnitRequest request) { return service.createUnit(request.command()); }

    @PutMapping("/units/{id}")
    UnitView updateUnit(@PathVariable Long id, @Valid @RequestBody UpdateUnitRequest request) {
        return service.updateUnit(id, revision(request.expectedRevision()), request.command());
    }

    @GetMapping("/unit-conversions")
    List<ConversionView> conversions(@RequestParam(required = false) Long catalogItemId) {
        return service.conversions(catalogItemId);
    }

    @PostMapping("/unit-conversions")
    @ResponseStatus(HttpStatus.CREATED)
    ConversionView createConversion(@Valid @RequestBody ConversionRequest request) {
        return service.createConversion(request.command());
    }

    @PutMapping("/unit-conversions/{id}")
    ConversionView updateConversion(@PathVariable Long id, @Valid @RequestBody UpdateConversionRequest request) {
        return service.updateConversion(id, revision(request.expectedRevision()), request.command());
    }

    @PostMapping("/unit-conversions/convert")
    ConversionResult convert(@Valid @RequestBody ConvertRequest request) {
        return service.convert(request.quantity(), request.fromUnitCode(), request.toUnitCode(),
                request.catalogItemId(), request.effectiveDate());
    }

    record LaboratoryProfileRequest(@NotNull @Min(0) BigInteger expectedRevision,
            @Size(max = 64) String laboratoryMethod, @DecimalMin(value = "0", inclusive = false) BigDecimal reportDuration,
            @Size(max = 64) String reportDurationUnit, boolean fastingRequired, boolean pointOfCare,
            @Size(max = 2000) String collectionDescription) {
        LaboratoryProfileCommand command() { return new LaboratoryProfileCommand(laboratoryMethod, reportDuration,
                reportDurationUnit, fastingRequired, pointOfCare, collectionDescription); }
    }
    record SpecimenRequest(@NotNull Long specimenItemId, Long containerItemId,
            @DecimalMin(value = "0", inclusive = false) BigDecimal minimumQuantity,
            @Size(max = 64) String minimumQuantityUnit, boolean defaultSpecimen, boolean requiredSpecimen,
            @Min(0) int sortOrder, @Size(max = 2000) String collectionDescription,
            @NotBlank @Pattern(regexp = "ACTIVE|INACTIVE") String status,
            @Size(max = 64) String tubeGroupCode,
            @Pattern(regexp = "SEPARATE|SHARE|BY_TEST_COUNT") String tubeSharingMode,
            @Min(1) Integer baseTubeCount, @Min(1) Integer maxTestsPerTube,
            @Pattern(regexp = "NONE|PER_TUBE|EXCESS_TUBE") String tubeChargeMode,
            Long tubeChargeItemId, @Min(0) Integer includedTubeCount,
            @DecimalMin(value = "0", inclusive = false) BigDecimal tubeChargeQuantity) {
        SpecimenCommand command() { return new SpecimenCommand(specimenItemId, containerItemId, minimumQuantity,
                minimumQuantityUnit, defaultSpecimen, requiredSpecimen, sortOrder, collectionDescription, status,
                tubeGroupCode, tubeSharingMode == null ? "SEPARATE" : tubeSharingMode,
                baseTubeCount == null ? 1 : baseTubeCount, maxTestsPerTube,
                tubeChargeMode == null ? "NONE" : tubeChargeMode, tubeChargeItemId,
                includedTubeCount == null ? 0 : includedTubeCount,
                tubeChargeQuantity == null ? BigDecimal.ONE : tubeChargeQuantity); }
    }
    record UpdateSpecimenRequest(@NotNull @Min(0) BigInteger expectedRevision, @NotNull Long specimenItemId,
            Long containerItemId, @DecimalMin(value = "0", inclusive = false) BigDecimal minimumQuantity,
            @Size(max = 64) String minimumQuantityUnit, boolean defaultSpecimen, boolean requiredSpecimen,
            @Min(0) int sortOrder, @Size(max = 2000) String collectionDescription,
            @NotBlank @Pattern(regexp = "ACTIVE|INACTIVE") String status,
            @Size(max = 64) String tubeGroupCode,
            @Pattern(regexp = "SEPARATE|SHARE|BY_TEST_COUNT") String tubeSharingMode,
            @Min(1) Integer baseTubeCount, @Min(1) Integer maxTestsPerTube,
            @Pattern(regexp = "NONE|PER_TUBE|EXCESS_TUBE") String tubeChargeMode,
            Long tubeChargeItemId, @Min(0) Integer includedTubeCount,
            @DecimalMin(value = "0", inclusive = false) BigDecimal tubeChargeQuantity) {
        SpecimenCommand command() { return new SpecimenCommand(specimenItemId, containerItemId, minimumQuantity,
                minimumQuantityUnit, defaultSpecimen, requiredSpecimen, sortOrder, collectionDescription, status,
                tubeGroupCode, tubeSharingMode == null ? "SEPARATE" : tubeSharingMode,
                baseTubeCount == null ? 1 : baseTubeCount, maxTestsPerTube,
                tubeChargeMode == null ? "NONE" : tubeChargeMode, tubeChargeItemId,
                includedTubeCount == null ? 0 : includedTubeCount,
                tubeChargeQuantity == null ? BigDecimal.ONE : tubeChargeQuantity); }
    }
    record ExaminationProfileRequest(@NotNull @Min(0) BigInteger expectedRevision,
            @Size(max = 64) String examinationType, boolean bodySiteRequired, boolean multiBodySite,
            @Min(1) Integer maxBodySiteCount, @Size(max = 2000) String preparationDescription,
            @Pattern(regexp = "SINGLE|PER_SITE|BASE_PLUS_FIXED|BASE_PLUS_ITEM") String sitePricingMode,
            @Min(1) Integer includedSiteCount, @DecimalMin("0") BigDecimal additionalSitePrice,
            Long additionalSiteItemId,
            @DecimalMin(value = "0", inclusive = false) BigDecimal additionalSiteQuantity,
            @Min(1) Integer maxChargeableSiteCount) {
        ExaminationProfileCommand command() { return new ExaminationProfileCommand(examinationType,
                bodySiteRequired, multiBodySite, maxBodySiteCount, preparationDescription,
                sitePricingMode, includedSiteCount, additionalSitePrice, additionalSiteItemId,
                additionalSiteQuantity, maxChargeableSiteCount); }
    }
    record VariantRequest(Long bodySiteConceptId, @NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @NotBlank @Size(max = 300) String name, @Size(max = 64) String methodType,
            boolean bodySiteRequired, @Size(max = 128) String mutualRecognitionCode, @Min(0) int sortOrder,
            @NotBlank @Pattern(regexp = "ACTIVE|INACTIVE") String status) {
        ExaminationVariantCommand command() { return new ExaminationVariantCommand(bodySiteConceptId, code, name,
                methodType, bodySiteRequired, mutualRecognitionCode, sortOrder, status); }
    }
    record UpdateVariantRequest(@NotNull @Min(0) BigInteger expectedRevision, Long bodySiteConceptId,
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code, @NotBlank @Size(max = 300) String name,
            @Size(max = 64) String methodType, boolean bodySiteRequired,
            @Size(max = 128) String mutualRecognitionCode, @Min(0) int sortOrder,
            @NotBlank @Pattern(regexp = "ACTIVE|INACTIVE") String status) {
        ExaminationVariantCommand command() { return new ExaminationVariantCommand(bodySiteConceptId, code, name,
                methodType, bodySiteRequired, mutualRecognitionCode, sortOrder, status); }
    }
    record AttachmentRequest(@NotNull Long attachmentCatalogItemId,
            @NotBlank @Pattern(regexp = "ALWAYS|OPTIONAL|MULTI_SITE") String triggerType,
            @NotBlank @Pattern(regexp = "FIXED|PER_SITE|PER_EXTRA_SITE") String quantityBasis,
            @NotNull @DecimalMin(value = "0", inclusive = false) BigDecimal quantity,
            boolean requiredAttachment, boolean separatelyChargeable, @Min(0) int sortOrder,
            @Size(max = 1000) String description,
            @NotBlank @Pattern(regexp = "ACTIVE|INACTIVE") String status) {
        ExaminationAttachmentCommand command() { return new ExaminationAttachmentCommand(attachmentCatalogItemId,
                triggerType, quantityBasis, quantity, requiredAttachment, separatelyChargeable,
                sortOrder, description, status); }
    }
    record UpdateAttachmentRequest(@NotNull @Min(0) BigInteger expectedRevision,
            @NotNull Long attachmentCatalogItemId,
            @NotBlank @Pattern(regexp = "ALWAYS|OPTIONAL|MULTI_SITE") String triggerType,
            @NotBlank @Pattern(regexp = "FIXED|PER_SITE|PER_EXTRA_SITE") String quantityBasis,
            @NotNull @DecimalMin(value = "0", inclusive = false) BigDecimal quantity,
            boolean requiredAttachment, boolean separatelyChargeable, @Min(0) int sortOrder,
            @Size(max = 1000) String description,
            @NotBlank @Pattern(regexp = "ACTIVE|INACTIVE") String status) {
        ExaminationAttachmentCommand command() { return new ExaminationAttachmentCommand(attachmentCatalogItemId,
                triggerType, quantityBasis, quantity, requiredAttachment, separatelyChargeable,
                sortOrder, description, status); }
    }
    record ExaminationChargePlanRequest(@NotNull List<@NotBlank String> bodySiteCodes,
            List<@NotNull Long> selectedAttachmentIds) {}
    record LaboratoryOrderItemRequest(@NotNull Long serviceId, Long specimenConfigurationId,
            @Min(1) int quantity) {
        LaboratoryOrderItemCommand command() { return new LaboratoryOrderItemCommand(serviceId,
                specimenConfigurationId, quantity); }
    }
    record LaboratoryTubePlanRequest(@NotEmpty List<@Valid LaboratoryOrderItemRequest> items) {}
    record SupplyRequest(@NotBlank @Pattern(regexp = "CONSUMABLE|DEVICE") String supplyType,
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code, @NotBlank @Size(max = 300) String name,
            @NotBlank @Size(max = 64) String unitCode, boolean orderable, boolean chargeable, boolean stocked,
            @NotBlank @Pattern(regexp = "ACTIVE|INACTIVE") String status, @NotNull LocalDate validFrom,
            LocalDate validTo, @Size(max = 128) String udiDi, @Size(max = 128) String genericCode,
            @Size(max = 300) String genericName, @Size(max = 300) String modelName,
            @Size(max = 500) String specification, @Size(max = 64) String materialType,
            @Pattern(regexp = "I|II|III") String deviceClass, boolean highValue, boolean implant,
            boolean intervention, boolean sterile, boolean singleUse, @Size(max = 128) String registrationCode,
            @Size(max = 500) String registrationName, @Size(max = 300) String registrantName,
            LocalDate registrationFrom, LocalDate registrationTo, Long manufacturerId,
            @Size(max = 4000) String structureDescription, @Size(max = 4000) String scopeDescription,
            String instruction) {
        SupplyCommand command() { return new SupplyCommand(supplyType, code, name, unitCode, orderable, chargeable,
                stocked, status, validFrom, validTo, udiDi, genericCode, genericName, modelName, specification,
                materialType, deviceClass, highValue, implant, intervention, sterile, singleUse, registrationCode,
                registrationName, registrantName, registrationFrom, registrationTo, manufacturerId,
                structureDescription, scopeDescription, instruction); }
    }
    record UpdateSupplyRequest(@NotNull @Min(0) BigInteger expectedRevision,
            @NotBlank @Pattern(regexp = "CONSUMABLE|DEVICE") String supplyType,
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code, @NotBlank @Size(max = 300) String name,
            @NotBlank @Size(max = 64) String unitCode, boolean orderable, boolean chargeable, boolean stocked,
            @NotBlank @Pattern(regexp = "ACTIVE|INACTIVE") String status, @NotNull LocalDate validFrom,
            LocalDate validTo, @Size(max = 128) String udiDi, @Size(max = 128) String genericCode,
            @Size(max = 300) String genericName, @Size(max = 300) String modelName,
            @Size(max = 500) String specification, @Size(max = 64) String materialType,
            @Pattern(regexp = "I|II|III") String deviceClass, boolean highValue, boolean implant,
            boolean intervention, boolean sterile, boolean singleUse, @Size(max = 128) String registrationCode,
            @Size(max = 500) String registrationName, @Size(max = 300) String registrantName,
            LocalDate registrationFrom, LocalDate registrationTo, Long manufacturerId,
            @Size(max = 4000) String structureDescription, @Size(max = 4000) String scopeDescription,
            String instruction) {
        SupplyCommand command() { return new SupplyCommand(supplyType, code, name, unitCode, orderable, chargeable,
                stocked, status, validFrom, validTo, udiDi, genericCode, genericName, modelName, specification,
                materialType, deviceClass, highValue, implant, intervention, sterile, singleUse, registrationCode,
                registrationName, registrantName, registrationFrom, registrationTo, manufacturerId,
                structureDescription, scopeDescription, instruction); }
    }
    record GroupMemberRequest(@NotNull Long catalogItemId, @Min(0) int sortOrder,
            @NotNull @DecimalMin(value = "0", inclusive = false) BigDecimal quantity,
            @Size(max = 64) String unitCode, boolean requiredMember, @Size(max = 1000) String memberDescription) {
        GroupMemberCommand command() { return new GroupMemberCommand(catalogItemId, sortOrder, quantity, unitCode,
                requiredMember, memberDescription); }
    }
    record ItemGroupRequest(Long organizationId, Long executionDepartmentId,
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code, @NotBlank @Size(max = 300) String name,
            @NotBlank @Pattern(regexp = "LIS|PACS|ORDER_SET|PACKAGE") String groupType,
            @Size(max = 32) String usageType, boolean pointOfCare,
            @NotBlank @Pattern(regexp = "ACTIVE|INACTIVE") String status, @NotNull LocalDate validFrom,
            LocalDate validTo, @NotEmpty List<@Valid GroupMemberRequest> members) {
        ItemGroupCommand command() { return new ItemGroupCommand(organizationId, executionDepartmentId, code, name,
                groupType, usageType, pointOfCare, status, validFrom, validTo,
                members.stream().map(GroupMemberRequest::command).toList()); }
    }
    record UpdateItemGroupRequest(@NotNull @Min(0) BigInteger expectedRevision, Long organizationId,
            Long executionDepartmentId, @NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @NotBlank @Size(max = 300) String name,
            @NotBlank @Pattern(regexp = "LIS|PACS|ORDER_SET|PACKAGE") String groupType,
            @Size(max = 32) String usageType, boolean pointOfCare,
            @NotBlank @Pattern(regexp = "ACTIVE|INACTIVE") String status, @NotNull LocalDate validFrom,
            LocalDate validTo, @NotEmpty List<@Valid GroupMemberRequest> members) {
        ItemGroupCommand command() { return new ItemGroupCommand(organizationId, executionDepartmentId, code, name,
                groupType, usageType, pointOfCare, status, validFrom, validTo,
                members.stream().map(GroupMemberRequest::command).toList()); }
    }
    record UnitRequest(@NotBlank @Pattern(regexp = CODE_PATTERN) String code, @NotBlank @Size(max = 160) String name,
            @Size(max = 32) String symbol,
            @NotBlank @Pattern(regexp = "COUNT|MASS|VOLUME|TIME|LENGTH|AREA|ACTIVITY|TEMPERATURE|OTHER") String dimension,
            @Min(0) @Max(12) int decimalScale, @NotBlank @Pattern(regexp = "ACTIVE|INACTIVE") String status) {
        UnitCommand command() { return new UnitCommand(code, name, symbol, dimension, decimalScale, status); }
    }
    record UpdateUnitRequest(@NotNull @Min(0) BigInteger expectedRevision,
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code, @NotBlank @Size(max = 160) String name,
            @Size(max = 32) String symbol,
            @NotBlank @Pattern(regexp = "COUNT|MASS|VOLUME|TIME|LENGTH|AREA|ACTIVITY|TEMPERATURE|OTHER") String dimension,
            @Min(0) @Max(12) int decimalScale, @NotBlank @Pattern(regexp = "ACTIVE|INACTIVE") String status) {
        UnitCommand command() { return new UnitCommand(code, name, symbol, dimension, decimalScale, status); }
    }
    record ConversionRequest(Long catalogItemId, @NotBlank @Size(max = 64) String fromUnitCode,
            @NotBlank @Size(max = 64) String toUnitCode,
            @NotNull @DecimalMin(value = "0", inclusive = false) BigDecimal factor, BigDecimal offset,
            @NotNull LocalDate validFrom, LocalDate validTo,
            @NotBlank @Pattern(regexp = "ACTIVE|INACTIVE") String status) {
        ConversionCommand command() { return new ConversionCommand(catalogItemId, fromUnitCode, toUnitCode,
                factor, offset, validFrom, validTo, status); }
    }
    record UpdateConversionRequest(@NotNull @Min(0) BigInteger expectedRevision, Long catalogItemId,
            @NotBlank @Size(max = 64) String fromUnitCode, @NotBlank @Size(max = 64) String toUnitCode,
            @NotNull @DecimalMin(value = "0", inclusive = false) BigDecimal factor, BigDecimal offset,
            @NotNull LocalDate validFrom, LocalDate validTo,
            @NotBlank @Pattern(regexp = "ACTIVE|INACTIVE") String status) {
        ConversionCommand command() { return new ConversionCommand(catalogItemId, fromUnitCode, toUnitCode,
                factor, offset, validFrom, validTo, status); }
    }
    record ConvertRequest(@NotNull BigDecimal quantity, @NotBlank String fromUnitCode,
            @NotBlank String toUnitCode, Long catalogItemId, LocalDate effectiveDate) {}
    record StatusRequest(@NotNull @Min(0) BigInteger expectedRevision,
            @NotBlank @Pattern(regexp = "ACTIVE|INACTIVE") String status) {}

    private static long revision(BigInteger value) { return value.longValueExact(); }
}
