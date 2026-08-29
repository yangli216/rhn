package com.rhn.pharmacy.web;

import com.rhn.pharmacy.api.PharmacyViews.DispenseTaskView;
import com.rhn.pharmacy.api.PharmacyViews.PharmacyInboxItem;
import com.rhn.pharmacy.api.PharmacyViews.StockItemView;
import com.rhn.pharmacy.api.PharmacyViews.StockSiteView;
import com.rhn.pharmacy.application.PharmacyApplicationService;
import com.rhn.pharmacy.application.PharmacyApplicationService.CreateSiteCommand;
import com.rhn.pharmacy.application.PharmacyApplicationService.CreateStockItemCommand;
import com.rhn.pharmacy.application.PharmacyApplicationService.IntakeCommand;
import com.rhn.pharmacy.application.PharmacyApplicationService.ReviewCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/pharmacy")
public class PharmacyController {
    private final PharmacyApplicationService service;

    public PharmacyController(PharmacyApplicationService service) { this.service = service; }

    @PostMapping("/stock-sites")
    @ResponseStatus(HttpStatus.CREATED)
    StockSiteView createSite(@Valid @RequestBody CreateSiteRequest input) { return service.createSite(input.command()); }

    @GetMapping("/stock-sites")
    List<StockSiteView> sites(@RequestParam Long organizationId) { return service.sites(organizationId); }

    @PostMapping("/stock-sites/{siteId}/stock-items")
    @ResponseStatus(HttpStatus.CREATED)
    StockItemView createStockItem(@PathVariable Long siteId, @Valid @RequestBody CreateStockItemRequest input) {
        return service.createStockItem(siteId, input.command());
    }

    @PostMapping("/stock-sites/{siteId}/stock-items/batch")
    @ResponseStatus(HttpStatus.CREATED)
    List<StockItemView> createStockItems(@PathVariable Long siteId,
                                         @Valid @RequestBody BatchCreateStockItemsRequest input) {
        return service.createStockItems(siteId, input.items().stream().map(CreateStockItemRequest::command).toList());
    }

    @GetMapping("/stock-sites/{siteId}/stock-items")
    List<StockItemView> stockItems(@PathVariable Long siteId) { return service.stockItems(siteId); }

    @GetMapping("/inbox")
    List<PharmacyInboxItem> inbox(@RequestParam Long organizationId) { return service.inbox(organizationId); }

    @PostMapping("/requests/{requestId}/intake")
    @ResponseStatus(HttpStatus.CREATED)
    DispenseTaskView intake(@PathVariable Long requestId, @Valid @RequestBody IntakeRequest input) {
        return service.intake(requestId, new IntakeCommand(input.stockItemId(), input.description()));
    }

    @GetMapping("/dispense-tasks")
    List<DispenseTaskView> tasks(@RequestParam Long stockSiteId,
                                 @RequestParam(required = false) String status) {
        return service.tasks(stockSiteId, status);
    }

    @GetMapping("/dispense-tasks/{taskId}")
    DispenseTaskView task(@PathVariable Long taskId) { return service.task(taskId); }

    @PostMapping("/dispense-tasks/{taskId}/reviews")
    DispenseTaskView review(@PathVariable Long taskId, @Valid @RequestBody ReviewRequest input) {
        return service.review(taskId, input.command());
    }

    record CreateSiteRequest(
            @NotNull Long organizationId, Long departmentId,
            @NotBlank @Size(max = 64) String code,
            @NotBlank @Size(max = 200) String name,
            @NotBlank @Pattern(regexp = "WAREHOUSE|PHARMACY|DEPARTMENT_STORE|VIRTUAL") String siteType,
            @NotBlank @Pattern(regexp = "OUTPATIENT|INPATIENT|EMERGENCY|COMMUNITY|MIXED") String serviceScope,
            @NotNull LocalDate validFrom, LocalDate validTo) {
        CreateSiteCommand command() { return new CreateSiteCommand(organizationId, departmentId, code, name,
                siteType, serviceScope, validFrom, validTo); }
    }

    record CreateStockItemRequest(
            @NotNull Long catalogItemId, @NotNull Long packageId,
            @NotBlank @Pattern(regexp = "FEFO|FIFO|MANUAL") String issuePolicy,
            boolean negativeAllowed, boolean lotRequired, boolean traceRequired, boolean splitAllowed,
            boolean coldChain, boolean controlled, @Size(max = 32) String controlLevel,
            boolean highAlert) {
        CreateStockItemCommand command() { return new CreateStockItemCommand(catalogItemId, packageId,
                issuePolicy, negativeAllowed, lotRequired, traceRequired, splitAllowed, coldChain,
                controlled, controlLevel, highAlert); }
    }

    record BatchCreateStockItemsRequest(
            @NotNull @Size(min = 1, max = 200) List<@Valid CreateStockItemRequest> items) {}

    record IntakeRequest(@NotNull Long stockItemId, @Size(max = 1000) String description) {}

    record ReviewRequest(
            @NotBlank @Pattern(regexp = "PASS|REJECT|INTERVENE|OVERRIDE") String result,
            @Size(max = 64) String reasonCode, @Size(max = 2000) String description,
            @NotNull Long pharmacistPractitionerId, @NotNull Long reviewerAssignmentId) {
        ReviewCommand command() { return new ReviewCommand(result, reasonCode, description,
                pharmacistPractitionerId, reviewerAssignmentId); }
    }
}
