package com.rhn.pharmacy.web;

import com.rhn.pharmacy.api.InventoryPriceAdjustmentViews.PriceAdjustmentView;
import com.rhn.pharmacy.application.InventoryPriceAdjustmentApplicationService;
import com.rhn.pharmacy.application.InventoryPriceAdjustmentApplicationService.AdjustmentLineCommand;
import com.rhn.pharmacy.application.InventoryPriceAdjustmentApplicationService.CreateCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
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
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/pharmacy/inventory-price-adjustments")
@PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_ADJUST)
public class InventoryPriceAdjustmentController {
    private final InventoryPriceAdjustmentApplicationService service;

    public InventoryPriceAdjustmentController(InventoryPriceAdjustmentApplicationService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    PriceAdjustmentView create(@Valid @RequestBody CreateRequest input) { return service.create(input.command()); }

    @GetMapping
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    List<PriceAdjustmentView> list(@RequestParam Long stockSiteId) { return service.list(stockSiteId); }

    @GetMapping("/{id}")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    PriceAdjustmentView get(@PathVariable Long id) { return service.get(id); }

    @PostMapping("/{id}/submit")
    PriceAdjustmentView submit(@PathVariable Long id) { return service.submit(id); }

    @PostMapping("/{id}/approve")
    PriceAdjustmentView approve(@PathVariable Long id) { return service.approve(id); }

    @PostMapping("/{id}/post")
    PriceAdjustmentView post(@PathVariable Long id) { return service.post(id); }

    @PostMapping("/{id}/cancel")
    PriceAdjustmentView cancel(@PathVariable Long id) { return service.cancel(id); }

    record CreateRequest(
            @NotNull Long stockSiteId,
            @NotBlank @Size(max = 128) String requestCode,
            @NotBlank @Pattern(regexp = "SALE_PRICE|COST_REVALUE") String adjustmentType,
            @Size(max = 32) String priceType,
            @NotNull LocalDate businessDate,
            @Pattern(regexp = "[A-Za-z]{3}") String currencyCode,
            @Size(max = 128) String priceDocumentCode,
            @NotBlank @Size(max = 1000) String reason,
            @NotEmpty List<@Valid LineRequest> lines) {
        CreateCommand command() {
            return new CreateCommand(stockSiteId, requestCode, adjustmentType, priceType, businessDate,
                    currencyCode, priceDocumentCode, reason,
                    lines.stream().map(LineRequest::command).toList());
        }
    }

    record LineRequest(
            @NotNull Long stockItemId,
            @DecimalMin("0") @Digits(integer = 18, fraction = 6) BigDecimal newSalePrice,
            @DecimalMin("0") @Digits(integer = 18, fraction = 6) BigDecimal newUnitCost) {
        AdjustmentLineCommand command() { return new AdjustmentLineCommand(stockItemId, newSalePrice, newUnitCost); }
    }
}
