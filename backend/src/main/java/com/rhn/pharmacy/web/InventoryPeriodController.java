package com.rhn.pharmacy.web;

import com.rhn.pharmacy.api.InventoryAccuracyViews.InventoryPeriodView;
import com.rhn.pharmacy.api.InventoryAccuracyViews.PeriodCloseDifferenceView;
import com.rhn.pharmacy.api.InventoryAccuracyViews.PeriodCloseRunView;
import com.rhn.pharmacy.application.InventoryPeriodCloseApplicationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
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

import java.time.YearMonth;
import java.util.List;

@RestController
@RequestMapping("/api/pharmacy/inventory-periods")
@PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_ADJUST)
public class InventoryPeriodController {
    private final InventoryPeriodCloseApplicationService service;

    public InventoryPeriodController(InventoryPeriodCloseApplicationService service) { this.service = service; }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    InventoryPeriodView create(@Valid @RequestBody CreatePeriodRequest input) {
        return service.createPeriod(input.stockSiteId(), YearMonth.parse(input.yearMonth()));
    }

    @GetMapping
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    List<InventoryPeriodView> periods(@RequestParam Long stockSiteId) { return service.periods(stockSiteId); }

    @PostMapping("/{periodId}/close-runs")
    @ResponseStatus(HttpStatus.CREATED)
    PeriodCloseRunView prepare(@PathVariable Long periodId, @Valid @RequestBody PrepareCloseRequest input) {
        return service.prepareClose(periodId, input.requestCode(), input.currencyCode());
    }

    @GetMapping("/close-runs/{closeRunId}")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    PeriodCloseRunView closeRun(@PathVariable Long closeRunId) { return service.closeRun(closeRunId); }

    @GetMapping("/{periodId}/close-runs")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    List<PeriodCloseRunView> closeRuns(@PathVariable Long periodId) { return service.closeRuns(periodId); }

    @GetMapping("/close-runs/{closeRunId}/differences")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    List<PeriodCloseDifferenceView> differences(@PathVariable Long closeRunId) {
        return service.differences(closeRunId);
    }

    @PostMapping("/close-runs/{closeRunId}/post")
    PeriodCloseRunView post(@PathVariable Long closeRunId) { return service.postClose(closeRunId); }

    record CreatePeriodRequest(@NotNull Long stockSiteId,
                               @NotBlank @Pattern(regexp = "\\d{4}-(0[1-9]|1[0-2])") String yearMonth) {}

    record PrepareCloseRequest(@NotBlank @Size(max = 128) String requestCode,
                               @Pattern(regexp = "[A-Za-z]{3}") String currencyCode) {}
}
