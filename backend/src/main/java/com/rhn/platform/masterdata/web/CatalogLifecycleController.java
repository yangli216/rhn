package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.CatalogLifecycleViews.CatalogChangeBatchView;
import com.rhn.platform.masterdata.api.CatalogLifecycleViews.CatalogLifecycleView;
import com.rhn.platform.masterdata.api.CatalogLifecycleViews.CatalogAdoptionCandidateView;
import com.rhn.platform.masterdata.application.CatalogLifecycleService;
import com.rhn.platform.masterdata.application.CatalogLifecycleService.AdoptionInput;
import com.rhn.platform.masterdata.application.CatalogLifecycleService.AdoptionTemplate;
import com.rhn.platform.masterdata.application.CatalogLifecycleService.PriceBatchEntry;
import com.rhn.platform.masterdata.application.CatalogLifecycleService.PriceInput;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.LocalDate;
import java.util.List;
import com.rhn.shared.api.PageResult;

@RestController
@RequestMapping("/api/platform/master-data/catalog-lifecycle")
@PreAuthorize("hasAnyAuthority('ORG_CATALOG.ACCESS','ORG_CATALOG.MANAGE')")
public class CatalogLifecycleController {
    private final CatalogLifecycleService service;

    public CatalogLifecycleController(CatalogLifecycleService service) { this.service = service; }

    @GetMapping("/catalog-items/{catalogItemId}")
    CatalogLifecycleView maintenance(@PathVariable Long catalogItemId,
                                     @RequestParam(required = false) Long organizationId,
                                     @RequestParam(required = false) LocalDate businessDate) {
        return service.maintenance(catalogItemId, organizationId, businessDate);
    }

    @GetMapping("/adoption-candidates")
    PageResult<CatalogAdoptionCandidateView> adoptionCandidates(
            @RequestParam Long organizationId,
            @RequestParam @Pattern(regexp = "SERVICE|MED_PRODUCT") String itemType,
            @RequestParam(required = false, defaultValue = "") String query,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) int size) {
        return service.searchAdoptionCandidates(organizationId, itemType, query, page, size);
    }

    @PostMapping("/catalog-items/{catalogItemId}/adoptions")
    @PreAuthorize("hasAuthority('ORG_CATALOG.MANAGE')")
    @ResponseStatus(HttpStatus.CREATED)
    CatalogLifecycleView createAdoption(@PathVariable Long catalogItemId,
                                        @Valid @RequestBody AdoptionRequest request) {
        return service.createAdoption(catalogItemId, request.input());
    }

    @PostMapping("/adoptions/{adoptionId}/replace")
    @PreAuthorize("hasAuthority('ORG_CATALOG.MANAGE')")
    CatalogLifecycleView replaceAdoption(@PathVariable Long adoptionId,
                                         @Valid @RequestBody ReplaceAdoptionRequest request) {
        return service.replaceAdoption(adoptionId, revision(request.expectedRevision()), request.input());
    }

    @PostMapping("/adoptions/{adoptionId}/status")
    @PreAuthorize("hasAuthority('ORG_CATALOG.MANAGE')")
    CatalogLifecycleView adoptionStatus(@PathVariable Long adoptionId,
                                        @Valid @RequestBody LifecycleStatusRequest request) {
        return service.changeAdoptionStatus(adoptionId, revision(request.expectedRevision()),
                request.status(), request.validTo());
    }

    @PostMapping("/catalog-items/{catalogItemId}/prices")
    @PreAuthorize("hasAuthority('ORG_CATALOG.MANAGE')")
    @ResponseStatus(HttpStatus.CREATED)
    CatalogLifecycleView createPrice(@PathVariable Long catalogItemId,
                                     @Valid @RequestBody PriceRequest request) {
        return service.createPrice(catalogItemId, request.input());
    }

    @PostMapping("/prices/{priceId}/replace")
    @PreAuthorize("hasAuthority('ORG_CATALOG.MANAGE')")
    CatalogLifecycleView replacePrice(@PathVariable Long priceId,
                                      @Valid @RequestBody ReplacePriceRequest request) {
        return service.replacePrice(priceId, revision(request.expectedRevision()), request.input());
    }

    @PostMapping("/prices/{priceId}/status")
    @PreAuthorize("hasAuthority('ORG_CATALOG.MANAGE')")
    CatalogLifecycleView priceStatus(@PathVariable Long priceId,
                                     @Valid @RequestBody LifecycleStatusRequest request) {
        return service.changePriceStatus(priceId, revision(request.expectedRevision()),
                request.status(), request.validTo());
    }

    @PostMapping("/adoption-batches")
    @PreAuthorize("hasAuthority('ORG_CATALOG.MANAGE')")
    @ResponseStatus(HttpStatus.CREATED)
    CatalogChangeBatchView adoptionBatch(@Valid @RequestBody AdoptionBatchRequest request) {
        return service.adoptionBatch(clean(request.requestCode()), request.operationType(), request.organizationId(),
                request.businessDate(), request.catalogItemIds(), request.template() == null ? null : request.template().value());
    }

    @PostMapping("/price-batches")
    @PreAuthorize("hasAuthority('ORG_CATALOG.MANAGE')")
    @ResponseStatus(HttpStatus.CREATED)
    CatalogChangeBatchView priceBatch(@Valid @RequestBody PriceBatchRequest request) {
        return service.priceBatch(clean(request.requestCode()), request.organizationId(), request.businessDate(),
                request.entries().stream().map(PriceBatchEntryRequest::value).toList());
    }

    @GetMapping("/batches/{batchId}")
    CatalogChangeBatchView batch(@PathVariable Long batchId) { return service.batch(batchId); }

    record AdoptionRequest(
            @NotNull Long organizationId, Long defaultDepartmentId,
            @Size(max = 64) String localCode, @Size(max = 300) String localName,
            boolean orderable, boolean executable, boolean chargeable, boolean purchasable,
            boolean stocked, boolean dispensable, boolean returnable,
            @NotBlank @Pattern(regexp = "ACTIVE|SUSPENDED|RETIRED") String status,
            @NotNull LocalDate validFrom, LocalDate validTo) {
        AdoptionInput input() { return new AdoptionInput(organizationId, defaultDepartmentId, optional(localCode),
                optional(localName), orderable, executable, chargeable, purchasable, stocked, dispensable,
                returnable, status, validFrom, validTo); }
    }

    record ReplaceAdoptionRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            @NotNull Long organizationId, Long defaultDepartmentId,
            @Size(max = 64) String localCode, @Size(max = 300) String localName,
            boolean orderable, boolean executable, boolean chargeable, boolean purchasable,
            boolean stocked, boolean dispensable, boolean returnable,
            @NotBlank @Pattern(regexp = "ACTIVE|SUSPENDED|RETIRED") String status,
            @NotNull LocalDate validFrom, LocalDate validTo) {
        AdoptionInput input() { return new AdoptionInput(organizationId, defaultDepartmentId, optional(localCode),
                optional(localName), orderable, executable, chargeable, purchasable, stocked, dispensable,
                returnable, status, validFrom, validTo); }
    }

    record PriceRequest(
            Long organizationId, Long packageId,
            @NotBlank @Size(max = 32) String priceType,
            @NotNull @DecimalMin("0") BigDecimal price,
            @NotBlank @Size(max = 16) String currencyCode,
            @Size(max = 128) String priceDocumentCode, @Size(max = 1000) String priceReason,
            @NotNull LocalDate validFrom, LocalDate validTo,
            @NotBlank @Pattern(regexp = "ACTIVE|SUSPENDED|RETIRED") String status) {
        PriceInput input() { return new PriceInput(organizationId, packageId, priceType, price, clean(currencyCode),
                optional(priceDocumentCode), optional(priceReason), validFrom, validTo, status); }
    }

    record ReplacePriceRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            Long organizationId, Long packageId,
            @NotBlank @Size(max = 32) String priceType,
            @NotNull @DecimalMin("0") BigDecimal price,
            @NotBlank @Size(max = 16) String currencyCode,
            @Size(max = 128) String priceDocumentCode, @Size(max = 1000) String priceReason,
            @NotNull LocalDate validFrom, LocalDate validTo,
            @NotBlank @Pattern(regexp = "ACTIVE|SUSPENDED|RETIRED") String status) {
        PriceInput input() { return new PriceInput(organizationId, packageId, priceType, price, clean(currencyCode),
                optional(priceDocumentCode), optional(priceReason), validFrom, validTo, status); }
    }

    record LifecycleStatusRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            @NotBlank @Pattern(regexp = "ACTIVE|SUSPENDED|RETIRED") String status,
            LocalDate validTo) {}

    record AdoptionBatchRequest(
            @NotBlank @Size(max = 128) String requestCode,
            @NotBlank @Pattern(regexp = "ADOPT|RETIRE") String operationType,
            @NotNull Long organizationId, @NotNull LocalDate businessDate,
            @NotEmpty @Size(max = 500) List<@NotNull Long> catalogItemIds,
            @Valid AdoptionTemplateRequest template) {}

    record AdoptionTemplateRequest(
            Long defaultDepartmentId, @Size(max = 64) String localCode, @Size(max = 300) String localName,
            boolean orderable, boolean executable, boolean chargeable, boolean purchasable,
            boolean stocked, boolean dispensable, boolean returnable,
            @NotBlank @Pattern(regexp = "ACTIVE|SUSPENDED|RETIRED") String status, LocalDate validTo) {
        AdoptionTemplate value() { return new AdoptionTemplate(defaultDepartmentId, optional(localCode),
                optional(localName), orderable, executable, chargeable, purchasable, stocked, dispensable,
                returnable, status, validTo); }
    }

    record PriceBatchRequest(
            @NotBlank @Size(max = 128) String requestCode, Long organizationId,
            @NotNull LocalDate businessDate,
            @NotEmpty @Size(max = 500) List<@Valid PriceBatchEntryRequest> entries) {}

    record PriceBatchEntryRequest(
            @NotNull Long catalogItemId, Long packageId,
            @NotBlank @Size(max = 32) String priceType,
            @NotNull @DecimalMin("0") BigDecimal price,
            @NotBlank @Size(max = 16) String currencyCode,
            @Size(max = 128) String priceDocumentCode, @Size(max = 1000) String priceReason,
            LocalDate validTo,
            @NotBlank @Pattern(regexp = "ACTIVE|SUSPENDED|RETIRED") String status,
            Long replacesPriceId, @Min(0) BigInteger expectedReplacesRevision) {
        PriceBatchEntry value() { return new PriceBatchEntry(catalogItemId, packageId, priceType, price,
                clean(currencyCode), optional(priceDocumentCode), optional(priceReason), validTo, status,
                replacesPriceId, expectedReplacesRevision == null ? null : revision(expectedReplacesRevision)); }
    }

    private static long revision(BigInteger value) {
        try { return value.longValueExact(); }
        catch (ArithmeticException exception) { throw new IllegalArgumentException("修订号超出BIGINT范围"); }
    }
    private static String clean(String value) { return value.trim(); }
    private static String optional(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
