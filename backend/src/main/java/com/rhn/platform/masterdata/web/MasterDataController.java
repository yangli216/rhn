package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.MasterDataCommands.AdoptionCommand;
import com.rhn.platform.masterdata.api.MasterDataCommands.ManufacturerCommand;
import com.rhn.platform.masterdata.api.MasterDataCommands.MedicationCommand;
import com.rhn.platform.masterdata.api.MasterDataCommands.PackageCommand;
import com.rhn.platform.masterdata.api.MasterDataCommands.PriceCommand;
import com.rhn.platform.masterdata.api.MasterDataCommands.ProductCommand;
import com.rhn.platform.masterdata.api.MasterDataCommands.ServiceCommand;
import com.rhn.platform.masterdata.api.MasterDataViews.ManufacturerView;
import com.rhn.platform.masterdata.api.MasterDataViews.ItemTypeView;
import com.rhn.platform.masterdata.api.MasterDataViews.MedicationProductView;
import com.rhn.platform.masterdata.api.MasterDataViews.MedicationView;
import com.rhn.platform.masterdata.api.MasterDataViews.OrganizationAdoptionView;
import com.rhn.platform.masterdata.api.MasterDataViews.PackageView;
import com.rhn.platform.masterdata.api.MasterDataViews.PriceView;
import com.rhn.platform.masterdata.api.MasterDataViews.ServiceView;
import com.rhn.platform.masterdata.application.MasterDataApplicationService;
import com.rhn.platform.masterdata.application.CatalogLifecycleService;
import com.rhn.platform.masterdata.application.CatalogLifecycleService.AdoptionInput;
import com.rhn.platform.masterdata.application.CatalogLifecycleService.PriceInput;
import com.rhn.shared.api.PageResult;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/platform/master-data")
public class MasterDataController {
    private static final String CODE_PATTERN = "[A-Za-z][A-Za-z0-9_.-]{0,63}";
    private final MasterDataApplicationService service;
    private final CatalogLifecycleService lifecycleService;

    public MasterDataController(MasterDataApplicationService service, CatalogLifecycleService lifecycleService) {
        this.service = service; this.lifecycleService = lifecycleService;
    }

    @GetMapping("/item-types")
    List<ItemTypeView> itemTypes(@RequestParam(required = false) String subjectType) {
        return service.listItemTypes(subjectType);
    }

    @GetMapping("/services")
    List<ServiceView> services(@RequestParam(required = false) String query,
                               @RequestParam(required = false) String serviceType,
                               @RequestParam(required = false) String status,
                               @RequestParam(required = false) Long organizationId) {
        return service.listServices(query, serviceType, status, organizationId);
    }

    @GetMapping("/services/search")
    PageResult<ServiceView> searchServices(@RequestParam(required = false) String query,
                                           @RequestParam(required = false) String serviceType,
                                           @RequestParam(required = false) String status,
                                           @RequestParam(required = false) Long organizationId,
                                           @RequestParam(defaultValue = "0") @Min(0) int page,
                                           @RequestParam(defaultValue = "20") @Min(10) int size) {
        return service.searchServices(query, serviceType, status, organizationId, page, size);
    }

    @PostMapping("/services")
    @ResponseStatus(HttpStatus.CREATED)
    ServiceView createService(@Valid @RequestBody ServiceRequest request,
                              @RequestParam(required = false) Long organizationId) {
        return service.createService(request.command(), organizationId);
    }

    @PutMapping("/services/{id}")
    ServiceView updateService(@PathVariable Long id, @Valid @RequestBody UpdateServiceRequest request,
                              @RequestParam(required = false) Long organizationId) {
        return service.updateService(id, revision(request.expectedRevision()), request.command(), organizationId);
    }

    @PostMapping("/services/{id}/status")
    ServiceView serviceStatus(@PathVariable Long id, @Valid @RequestBody StatusRequest request,
                              @RequestParam(required = false) Long organizationId) {
        return service.changeServiceStatus(id, revision(request.expectedRevision()), request.sdStatus(), organizationId);
    }

    @GetMapping("/medications")
    List<MedicationView> medications(@RequestParam(required = false) String query,
                                     @RequestParam(required = false) String medicationType,
                                     @RequestParam(required = false) String status,
                                     @RequestParam(required = false) Long organizationId) {
        return service.listMedications(query, medicationType, status, organizationId);
    }

    @GetMapping("/medications/search")
    PageResult<MedicationView> searchMedications(@RequestParam(required = false) String query,
                                                  @RequestParam(required = false) String medicationType,
                                                  @RequestParam(required = false) String status,
                                                  @RequestParam(required = false) Long organizationId,
                                                  @RequestParam(defaultValue = "0") @Min(0) int page,
                                                  @RequestParam(defaultValue = "20") @Min(10) int size) {
        return service.searchMedications(query, medicationType, status, organizationId, page, size);
    }

    @PostMapping("/medications")
    @ResponseStatus(HttpStatus.CREATED)
    MedicationView createMedication(@Valid @RequestBody MedicationRequest request,
                                    @RequestParam(required = false) Long organizationId) {
        return service.createMedication(request.command(), organizationId);
    }

    @PutMapping("/medications/{id}")
    MedicationView updateMedication(@PathVariable Long id, @Valid @RequestBody UpdateMedicationRequest request,
                                    @RequestParam(required = false) Long organizationId) {
        return service.updateMedication(id, revision(request.expectedRevision()), request.command(), organizationId);
    }

    @PostMapping("/medications/{id}/status")
    MedicationView medicationStatus(@PathVariable Long id, @Valid @RequestBody StatusRequest request,
                                    @RequestParam(required = false) Long organizationId) {
        return service.changeMedicationStatus(id, revision(request.expectedRevision()), request.sdStatus(), organizationId);
    }

    @GetMapping("/manufacturers")
    List<ManufacturerView> manufacturers(@RequestParam(required = false) String query) {
        return service.listManufacturers(query);
    }

    @PostMapping("/manufacturers")
    @ResponseStatus(HttpStatus.CREATED)
    ManufacturerView createManufacturer(@Valid @RequestBody ManufacturerRequest request) {
        return service.createManufacturer(request.command());
    }

    @PutMapping("/manufacturers/{id}")
    ManufacturerView updateManufacturer(@PathVariable Long id, @Valid @RequestBody UpdateManufacturerRequest request) {
        return service.updateManufacturer(id, revision(request.expectedRevision()), request.command());
    }

    @PostMapping("/manufacturers/{id}/status")
    ManufacturerView manufacturerStatus(@PathVariable Long id, @Valid @RequestBody StatusRequest request) {
        return service.changeManufacturerStatus(id, revision(request.expectedRevision()), request.sdStatus());
    }

    @PostMapping("/medication-products")
    @ResponseStatus(HttpStatus.CREATED)
    MedicationProductView createProduct(@Valid @RequestBody ProductRequest request,
                                        @RequestParam(required = false) Long organizationId) {
        return service.createProduct(request.command(), organizationId);
    }

    @PostMapping("/medication-products/setup")
    @ResponseStatus(HttpStatus.CREATED)
    MedicationProductView createProductSetup(@Valid @RequestBody ProductSetupRequest request) {
        return service.createProductSetup(request.product().command(), request.packaging().command(),
                request.organization().command(), request.purchasePrice(), request.salePrice(),
                optional(request.priceDocumentCode()));
    }

    @PutMapping("/medication-products/{id}")
    MedicationProductView updateProduct(@PathVariable Long id, @Valid @RequestBody UpdateProductRequest request,
                                        @RequestParam(required = false) Long organizationId) {
        return service.updateProduct(id, revision(request.expectedRevision()), request.command(), organizationId);
    }

    @PostMapping("/catalog-items/{id}/packages")
    @ResponseStatus(HttpStatus.CREATED)
    PackageView createPackage(@PathVariable Long id, @Valid @RequestBody PackageRequest request) {
        return service.createPackage(id, request.command());
    }

    @PutMapping("/packages/{id}")
    PackageView updatePackage(@PathVariable Long id, @Valid @RequestBody PackageRequest request) {
        return service.updatePackage(id, request.command());
    }

    @PostMapping("/catalog-items/{id}/organization-adoptions")
    @ResponseStatus(HttpStatus.CREATED)
    OrganizationAdoptionView adopt(@PathVariable Long id, @Valid @RequestBody AdoptionRequest request) {
        return lifecycleService.createAdoption(id, request.lifecycleInput()).currentAdoption();
    }

    @PostMapping("/catalog-items/{id}/prices")
    @ResponseStatus(HttpStatus.CREATED)
    PriceView createPrice(@PathVariable Long id, @Valid @RequestBody PriceRequest request) {
        return lifecycleService.createPrice(id, request.lifecycleInput()).currentPrices().stream()
                .filter(value -> value.sdPriceType().equals(request.sdPriceType()))
                .filter(value -> java.util.Objects.equals(value.organizationId(), request.organizationId()))
                .filter(value -> java.util.Objects.equals(value.packageId(), request.packageId()))
                .findFirst().orElseThrow();
    }

    record ServiceRequest(
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @NotBlank @Size(max = 300) String name,
            @Size(max = 64) String unitCode,
            boolean orderable, boolean chargeable,
            @NotBlank @Size(max = 32) String sdStatus,
            @NotNull LocalDate validFrom, LocalDate validTo,
            @NotBlank @Size(max = 64) String sdServiceType,
            @Size(max = 64) String serviceSubtype,
            @NotBlank @Size(max = 32) String sdUsageType,
            boolean medicalTechnology, boolean combinationItem, boolean singleOrder,
            @Size(max = 64) String specimenType,
            @Size(max = 64) String examinationType,
            @Size(max = 64) String accountingCategory,
            @Size(max = 64) String sdDuplicateRule,
            @DecimalMin("0") BigDecimal multiSitePrice,
            @Min(0) Integer freeSiteCount,
            @Min(1) Integer maxBodySiteCount,
            @Size(max = 128) String mutualRecognitionCode,
            boolean pregnancyAlert,
            @Size(max = 2000) String attention,
            @Size(max = 2000) String examinationNotes) {
        ServiceCommand command() { return new ServiceCommand(clean(code), clean(name), optional(unitCode), orderable,
                chargeable, sdStatus, validFrom, validTo, sdServiceType, optional(serviceSubtype), sdUsageType,
                medicalTechnology, combinationItem, singleOrder, optional(specimenType), optional(examinationType),
                optional(accountingCategory), optional(sdDuplicateRule), multiSitePrice, freeSiteCount,
                maxBodySiteCount, optional(mutualRecognitionCode), pregnancyAlert,
                optional(attention), optional(examinationNotes)); }
    }

    record UpdateServiceRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @NotBlank @Size(max = 300) String name,
            @Size(max = 64) String unitCode,
            boolean orderable, boolean chargeable,
            @NotBlank @Size(max = 32) String sdStatus,
            @NotNull LocalDate validFrom, LocalDate validTo,
            @NotBlank @Size(max = 64) String sdServiceType,
            @Size(max = 64) String serviceSubtype,
            @NotBlank @Size(max = 32) String sdUsageType,
            boolean medicalTechnology, boolean combinationItem, boolean singleOrder,
            @Size(max = 64) String specimenType,
            @Size(max = 64) String examinationType,
            @Size(max = 64) String accountingCategory,
            @Size(max = 64) String sdDuplicateRule,
            @DecimalMin("0") BigDecimal multiSitePrice,
            @Min(0) Integer freeSiteCount,
            @Min(1) Integer maxBodySiteCount,
            @Size(max = 128) String mutualRecognitionCode,
            boolean pregnancyAlert,
            @Size(max = 2000) String attention,
            @Size(max = 2000) String examinationNotes) {
        ServiceCommand command() { return new ServiceCommand(clean(code), clean(name), optional(unitCode), orderable,
                chargeable, sdStatus, validFrom, validTo, sdServiceType, optional(serviceSubtype), sdUsageType,
                medicalTechnology, combinationItem, singleOrder, optional(specimenType), optional(examinationType),
                optional(accountingCategory), optional(sdDuplicateRule), multiSitePrice, freeSiteCount,
                maxBodySiteCount, optional(mutualRecognitionCode), pregnancyAlert,
                optional(attention), optional(examinationNotes)); }
    }

    record MedicationRequest(
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @NotBlank @Size(max = 300) String name,
            @Size(max = 300) String aliasName,
            @NotBlank @Size(max = 32) String sdMedicationType,
            @Size(max = 64) String sdDoseForm,
            @Size(max = 300) String preparationSpec,
            @Size(max = 64) String preparationUnit,
            @DecimalMin(value = "0", inclusive = false) BigDecimal strengthValue,
            @Size(max = 64) String strengthUnit,
            @Size(max = 32) String sdStorageType,
            boolean prescriptionDrug, boolean essentialDrug, boolean antimicrobial,
            @Size(max = 64) String sdAntimicrobialLevel,
            boolean skinTestRequired,
            @DecimalMin(value = "0", inclusive = false) BigDecimal defaultDose,
            @Size(max = 64) String defaultDoseUnit,
            @Size(max = 64) String defaultRoute,
            @Size(max = 64) String defaultFrequency,
            boolean chronicDiseaseDrug, boolean singleOrder,
            @NotBlank @Size(max = 32) String sdStatus) {
        MedicationCommand command() { return new MedicationCommand(clean(code), clean(name), optional(aliasName),
                sdMedicationType, optional(sdDoseForm), optional(preparationSpec), optional(preparationUnit),
                strengthValue, optional(strengthUnit), optional(sdStorageType), prescriptionDrug, essentialDrug,
                antimicrobial, optional(sdAntimicrobialLevel), skinTestRequired, defaultDose,
                optional(defaultDoseUnit), optional(defaultRoute), optional(defaultFrequency),
                chronicDiseaseDrug, singleOrder, sdStatus); }
    }

    record UpdateMedicationRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @NotBlank @Size(max = 300) String name,
            @Size(max = 300) String aliasName,
            @NotBlank @Size(max = 32) String sdMedicationType,
            @Size(max = 64) String sdDoseForm,
            @Size(max = 300) String preparationSpec,
            @Size(max = 64) String preparationUnit,
            @DecimalMin(value = "0", inclusive = false) BigDecimal strengthValue,
            @Size(max = 64) String strengthUnit,
            @Size(max = 32) String sdStorageType,
            boolean prescriptionDrug, boolean essentialDrug, boolean antimicrobial,
            @Size(max = 64) String sdAntimicrobialLevel,
            boolean skinTestRequired,
            @DecimalMin(value = "0", inclusive = false) BigDecimal defaultDose,
            @Size(max = 64) String defaultDoseUnit,
            @Size(max = 64) String defaultRoute,
            @Size(max = 64) String defaultFrequency,
            boolean chronicDiseaseDrug, boolean singleOrder,
            @NotBlank @Size(max = 32) String sdStatus) {
        MedicationCommand command() { return new MedicationCommand(clean(code), clean(name), optional(aliasName),
                sdMedicationType, optional(sdDoseForm), optional(preparationSpec), optional(preparationUnit),
                strengthValue, optional(strengthUnit), optional(sdStorageType), prescriptionDrug, essentialDrug,
                antimicrobial, optional(sdAntimicrobialLevel), skinTestRequired, defaultDose,
                optional(defaultDoseUnit), optional(defaultRoute), optional(defaultFrequency),
                chronicDiseaseDrug, singleOrder, sdStatus); }
    }

    record ManufacturerRequest(
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @NotBlank @Size(max = 300) String name,
            @Size(max = 160) String shortName,
            @NotBlank @Size(max = 32) String sdManufacturerType,
            @Size(max = 32) String sdProductionPlace,
            @Size(max = 32) String countryCode,
            @Size(max = 1000) String address,
            @NotBlank @Size(max = 32) String sdStatus) {
        ManufacturerCommand command() { return new ManufacturerCommand(clean(code), clean(name), optional(shortName),
                sdManufacturerType, optional(sdProductionPlace), optional(countryCode), optional(address), sdStatus); }
    }

    record UpdateManufacturerRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @NotBlank @Size(max = 300) String name,
            @Size(max = 160) String shortName,
            @NotBlank @Size(max = 32) String sdManufacturerType,
            @Size(max = 32) String sdProductionPlace,
            @Size(max = 32) String countryCode,
            @Size(max = 1000) String address,
            @NotBlank @Size(max = 32) String sdStatus) {
        ManufacturerCommand command() { return new ManufacturerCommand(clean(code), clean(name), optional(shortName),
                sdManufacturerType, optional(sdProductionPlace), optional(countryCode), optional(address), sdStatus); }
    }

    record ProductRequest(
            @NotNull Long medicationId, @NotNull Long manufacturerId,
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @Size(max = 300) String tradeName,
            @Size(max = 128) String approvalCode,
            @Pattern(regexp = "^[0-9]{7}$", message = "追溯码应为7位数字") String traceCode,
            LocalDate approvalFrom, LocalDate approvalTo,
            @Size(max = 128) String registrationCode,
            LocalDate registrationFrom, LocalDate registrationTo,
            @Size(max = 128) String purchaseCode,
            @Size(max = 32) String sdMarketStatus,
            @Size(max = 32) String sdProductionPlace,
            boolean otc, boolean centralPurchase, boolean importAllowed, boolean traceSplitRequired,
            boolean orderable, boolean chargeable, boolean stocked,
            @DecimalMin(value = "0", inclusive = false) BigDecimal shelfLifeValue,
            @Size(max = 32) String sdShelfLifeUnit,
            @NotBlank @Size(max = 32) String sdStatus,
            @NotNull LocalDate validFrom, LocalDate validTo,
            @Size(max = 4000) String indication,
            String instruction) {
        ProductCommand command() { return new ProductCommand(medicationId, manufacturerId, clean(code),
                optional(tradeName), optional(approvalCode), optional(traceCode), approvalFrom, approvalTo,
                optional(registrationCode), registrationFrom, registrationTo, optional(purchaseCode),
                optional(sdMarketStatus), optional(sdProductionPlace), otc, centralPurchase, importAllowed,
                traceSplitRequired, orderable, chargeable, stocked, shelfLifeValue, optional(sdShelfLifeUnit),
                sdStatus, validFrom, validTo, optional(indication), optional(instruction)); }
    }

    record UpdateProductRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            @NotNull Long manufacturerId,
            @Size(max = 300) String tradeName,
            @Size(max = 128) String approvalCode,
            @Pattern(regexp = "^[0-9]{7}$", message = "追溯码应为7位数字") String traceCode,
            LocalDate approvalFrom, LocalDate approvalTo,
            @Size(max = 128) String registrationCode,
            LocalDate registrationFrom, LocalDate registrationTo,
            @Size(max = 128) String purchaseCode,
            @Size(max = 32) String sdMarketStatus,
            @Size(max = 32) String sdProductionPlace,
            boolean otc, boolean centralPurchase, boolean importAllowed, boolean traceSplitRequired,
            boolean orderable, boolean chargeable, boolean stocked,
            @DecimalMin(value = "0", inclusive = false) BigDecimal shelfLifeValue,
            @Size(max = 32) String sdShelfLifeUnit,
            @NotBlank @Size(max = 32) String sdStatus,
            @NotNull LocalDate validFrom, LocalDate validTo,
            @Size(max = 4000) String indication,
            String instruction) {
        ProductCommand command() { return new ProductCommand(null, manufacturerId, null,
                optional(tradeName), optional(approvalCode), optional(traceCode), approvalFrom, approvalTo,
                optional(registrationCode), registrationFrom, registrationTo, optional(purchaseCode),
                optional(sdMarketStatus), optional(sdProductionPlace), otc, centralPurchase, importAllowed,
                traceSplitRequired, orderable, chargeable, stocked, shelfLifeValue, optional(sdShelfLifeUnit),
                sdStatus, validFrom, validTo, optional(indication), optional(instruction)); }
    }

    record ProductSetupRequest(
            @NotNull @Valid ProductRequest product,
            @NotNull @Valid PackageRequest packaging,
            @NotNull @Valid AdoptionRequest organization,
            @NotNull @DecimalMin("0") BigDecimal purchasePrice,
            @NotNull @DecimalMin("0") BigDecimal salePrice,
            @Size(max = 128) String priceDocumentCode) {}

    record PackageRequest(
            Long basePackageId,
            @NotBlank @Size(max = 64) String unitCode,
            @NotBlank @Size(max = 160) String unitName,
            @Size(max = 300) String packageSpec,
            @NotNull @DecimalMin(value = "0", inclusive = false) BigDecimal quantityFactor,
            @NotBlank @Size(max = 32) String sdUsageType,
            @Size(max = 256) String barcode,
            boolean defaultPurchase, boolean defaultSale, boolean defaultDispense,
            @NotBlank @Size(max = 32) String sdStatus,
            @NotNull LocalDate validFrom, LocalDate validTo) {
        PackageCommand command() { return new PackageCommand(basePackageId, clean(unitCode), clean(unitName),
                optional(packageSpec), quantityFactor, sdUsageType, optional(barcode), defaultPurchase, defaultSale,
                defaultDispense, sdStatus, validFrom, validTo); }
    }

    record AdoptionRequest(
            @NotNull Long organizationId, Long defaultDepartmentId,
            @Size(max = 64) String localCode, @Size(max = 300) String localName,
            boolean orderable, boolean executable, boolean chargeable, boolean purchasable,
            boolean stocked, boolean dispensable, boolean returnable,
            @NotBlank @Size(max = 32) String sdStatus,
            @NotNull LocalDate validFrom, LocalDate validTo) {
        AdoptionCommand command() { return new AdoptionCommand(organizationId, defaultDepartmentId,
                optional(localCode), optional(localName), orderable, executable, chargeable, purchasable, stocked,
                dispensable, returnable, sdStatus, validFrom, validTo); }
        AdoptionInput lifecycleInput() { return new AdoptionInput(organizationId, defaultDepartmentId,
                optional(localCode), optional(localName), orderable, executable, chargeable, purchasable, stocked,
                dispensable, returnable, sdStatus, validFrom, validTo); }
    }

    record PriceRequest(
            Long organizationId, Long packageId,
            @NotBlank @Size(max = 32) String sdPriceType,
            @NotNull @DecimalMin("0") BigDecimal price,
            @NotBlank @Size(max = 16) String currencyCode,
            @Size(max = 128) String priceDocumentCode,
            @Size(max = 1000) String priceReason,
            @NotNull LocalDate validFrom, LocalDate validTo,
            @NotBlank @Size(max = 32) String sdStatus) {
        PriceCommand command() { return new PriceCommand(organizationId, packageId, sdPriceType, price,
                clean(currencyCode), optional(priceDocumentCode), optional(priceReason), validFrom, validTo, sdStatus); }
        PriceInput lifecycleInput() { return new PriceInput(organizationId, packageId, sdPriceType, price,
                clean(currencyCode), optional(priceDocumentCode), optional(priceReason), validFrom, validTo, sdStatus); }
    }

    record StatusRequest(@NotNull @Min(0) BigInteger expectedRevision,
                         @NotBlank @Size(max = 32) String sdStatus) {}

    private static String clean(String value) { return value.trim(); }
    private static String optional(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private long revision(BigInteger value) {
        try { return value.longValueExact(); }
        catch (ArithmeticException exception) { throw new IllegalArgumentException("修订号超出BIGINT范围"); }
    }
}
