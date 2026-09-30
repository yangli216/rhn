package com.rhn.pharmacy.web;

import com.rhn.pharmacy.api.InventoryOperationViews.CountView;
import com.rhn.pharmacy.api.PharmacyPermissions;
import com.rhn.pharmacy.application.StockCountApplicationService;
import com.rhn.pharmacy.application.StockCountApplicationService.CreateCountCommand;
import com.rhn.pharmacy.application.StockCountApplicationService.DecisionCommand;
import com.rhn.pharmacy.application.StockCountApplicationService.RecordCountCommand;
import com.rhn.pharmacy.application.StockCountApplicationService.RecordCountLineCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
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

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/pharmacy/stock-counts")
@PreAuthorize(PharmacyPermissions.WAREHOUSE_COUNT)
public class StockCountController {
    private final StockCountApplicationService service;

    public StockCountController(StockCountApplicationService service) { this.service = service; }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    CountView create(@Valid @RequestBody CreateRequest input) { return service.create(input.command()); }

    @GetMapping
    @PreAuthorize(PharmacyPermissions.WAREHOUSE_READ)
    List<CountView> list(@RequestParam Long stockSiteId) { return service.list(stockSiteId); }

    @PostMapping("/{id}/start")
    CountView start(@PathVariable Long id) { return service.start(id); }

    @PostMapping("/{id}/records")
    CountView record(@PathVariable Long id, @Valid @RequestBody RecordRequest input) {
        return service.record(id, input.command());
    }

    @PostMapping("/{id}/submit")
    CountView submit(@PathVariable Long id) { return service.submit(id); }

    @PostMapping("/{id}/approve")
    CountView approve(@PathVariable Long id, @Valid @RequestBody(required = false) DecisionRequest input) {
        return service.approve(id, new DecisionCommand(input == null ? null : input.reason()));
    }

    @PostMapping("/{id}/reject")
    CountView reject(@PathVariable Long id, @Valid @RequestBody DecisionRequest input) {
        return service.reject(id, new DecisionCommand(input.reason()));
    }

    @PostMapping("/{id}/post")
    CountView post(@PathVariable Long id) { return service.post(id); }

    record CreateRequest(
            @NotNull Long stockSiteId, Long stockBinId,
            @Size(max = 64) String countNo, @NotBlank @Size(max = 128) String requestCode,
            @NotBlank @Pattern(regexp = "FULL|BIN|ITEM|CYCLE") String countType,
            @Size(max = 500) List<Long> stockItemIds,
            @Size(max = 1000) String reason, @Size(max = 1000) String description) {
        CreateCountCommand command() {
            return new CreateCountCommand(stockSiteId, stockBinId, countNo, requestCode, countType,
                    stockItemIds, reason, description);
        }
    }

    record LineRequest(
            @NotNull Long countLineId,
            @NotNull @DecimalMin("0") @Digits(integer = 20, fraction = 8) BigDecimal countedQuantity,
            @Size(max = 1000) String varianceReason) {
        RecordCountLineCommand command() {
            return new RecordCountLineCommand(countLineId, countedQuantity, varianceReason);
        }
    }

    record RecordRequest(
            @Size(max = 1000) String description,
            @NotNull @Size(min = 1, max = 1000) List<@Valid LineRequest> lines) {
        RecordCountCommand command() {
            return new RecordCountCommand(description, lines.stream().map(LineRequest::command).toList());
        }
    }

    record DecisionRequest(@Size(max = 1000) String reason) {}
}
