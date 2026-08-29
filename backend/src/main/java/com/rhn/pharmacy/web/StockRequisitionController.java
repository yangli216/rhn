package com.rhn.pharmacy.web;

import com.rhn.pharmacy.api.InventoryOperationViews.RequisitionView;
import com.rhn.pharmacy.application.StockRequisitionApplicationService;
import com.rhn.pharmacy.application.StockRequisitionApplicationService.ApproveLineCommand;
import com.rhn.pharmacy.application.StockRequisitionApplicationService.ApproveRequisitionCommand;
import com.rhn.pharmacy.application.StockRequisitionApplicationService.CreateRequisitionCommand;
import com.rhn.pharmacy.application.StockRequisitionApplicationService.DecisionCommand;
import com.rhn.pharmacy.application.StockRequisitionApplicationService.RequisitionLineCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
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

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/pharmacy/stock-requisitions")
public class StockRequisitionController {
    private final StockRequisitionApplicationService service;
    public StockRequisitionController(StockRequisitionApplicationService service) { this.service = service; }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    RequisitionView create(@Valid @RequestBody CreateRequest input) { return service.create(input.command()); }
    @GetMapping
    List<RequisitionView> list(@RequestParam Long sourceSiteId) { return service.list(sourceSiteId); }
    @PostMapping("/{id}/submit") RequisitionView submit(@PathVariable Long id) { return service.submit(id); }
    @PostMapping("/{id}/approve")
    RequisitionView approve(@PathVariable Long id, @Valid @RequestBody ApproveRequest input) {
        return service.approve(id, input.command());
    }
    @PostMapping("/{id}/reject")
    RequisitionView reject(@PathVariable Long id, @Valid @RequestBody DecisionRequest input) {
        return service.reject(id, new DecisionCommand(input.reason()));
    }
    @PostMapping("/{id}/pick") RequisitionView pick(@PathVariable Long id) { return service.pick(id); }
    @PostMapping("/{id}/issue") RequisitionView issue(@PathVariable Long id) { return service.issue(id); }

    record LineRequest(@NotNull Long stockItemId,
                       @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 20, fraction = 8)
                       BigDecimal requestedQuantity, @Size(max = 1000) String description) {
        RequisitionLineCommand command() { return new RequisitionLineCommand(stockItemId, requestedQuantity, description); }
    }
    record CreateRequest(@NotNull Long sourceSiteId, Long requestingDepartmentId, Long destinationSiteId,
                         @Size(max = 64) String requisitionNo,
                         @NotBlank @Size(max = 128) String requestCode, Instant requestedAt,
                         @Size(max = 1000) String reason, @Size(max = 1000) String description,
                         @NotNull @Size(min = 1, max = 500) List<@Valid LineRequest> lines) {
        CreateRequisitionCommand command() { return new CreateRequisitionCommand(sourceSiteId,
                requestingDepartmentId, destinationSiteId, requisitionNo, requestCode, requestedAt, reason,
                description, lines.stream().map(LineRequest::command).toList()); }
    }
    record ApproveLineRequest(@NotNull Long requisitionLineId,
                              @NotNull @DecimalMin("0") @Digits(integer = 20, fraction = 8)
                              BigDecimal approvedQuantity) {
        ApproveLineCommand command() { return new ApproveLineCommand(requisitionLineId, approvedQuantity); }
    }
    record ApproveRequest(@Size(max = 1000) String reason,
                          @NotNull @Size(min = 1, max = 500) List<@Valid ApproveLineRequest> lines) {
        ApproveRequisitionCommand command() { return new ApproveRequisitionCommand(reason,
                lines.stream().map(ApproveLineRequest::command).toList()); }
    }
    record DecisionRequest(@NotBlank @Size(max = 1000) String reason) {}
}
