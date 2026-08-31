package com.rhn.pharmacy.web;

import com.rhn.pharmacy.api.InventoryAccuracyViews.OpenPackageView;
import com.rhn.pharmacy.api.InventoryAccuracyViews.ReconciliationRunView;
import com.rhn.pharmacy.api.InventoryAccuracyViews.SplitEventView;
import com.rhn.pharmacy.application.InventoryReconciliationApplicationService;
import com.rhn.pharmacy.application.InventorySplitApplicationService;
import com.rhn.pharmacy.application.InventorySplitApplicationService.OpenPackageCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
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

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/pharmacy/inventory")
@PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_ADJUST)
public class InventoryAccuracyController {
    private final InventorySplitApplicationService splitService;
    private final InventoryReconciliationApplicationService reconciliationService;

    public InventoryAccuracyController(InventorySplitApplicationService splitService,
                                       InventoryReconciliationApplicationService reconciliationService) {
        this.splitService = splitService; this.reconciliationService = reconciliationService;
    }

    @PostMapping("/open-packages")
    @ResponseStatus(HttpStatus.CREATED)
    OpenPackageView open(@Valid @RequestBody OpenPackageRequest input) { return splitService.open(input.command()); }

    @GetMapping("/open-packages")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    List<OpenPackageView> openPackages(@RequestParam Long stockSiteId) { return splitService.list(stockSiteId); }

    @GetMapping("/open-packages/{id}/events")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    List<SplitEventView> splitEvents(@PathVariable Long id) { return splitService.events(id); }

    @PostMapping("/reconciliations")
    ReconciliationRunView reconcile(@RequestParam Long stockSiteId,
                                    @RequestParam(required = false) LocalDate businessDate) {
        return reconciliationService.run(stockSiteId, businessDate);
    }

    @GetMapping("/reconciliations/latest")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    ReconciliationRunView latest(@RequestParam Long stockSiteId) {
        return reconciliationService.latest(stockSiteId);
    }

    record OpenPackageRequest(@NotBlank @Size(max = 128) String requestCode,
                              @NotNull Long stockSiteId, @NotNull Long stockBinId,
                              @NotNull Long stockItemId, @NotNull Long stockLotId,
                              Instant occurredAt, @Size(max = 1000) String description) {
        OpenPackageCommand command() { return new OpenPackageCommand(requestCode, stockSiteId, stockBinId,
                stockItemId, stockLotId, occurredAt, description); }
    }
}
