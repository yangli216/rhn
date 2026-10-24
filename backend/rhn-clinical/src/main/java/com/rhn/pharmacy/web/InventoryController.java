package com.rhn.pharmacy.web;

import com.rhn.pharmacy.api.PharmacyViews.InventoryBalanceView;
import com.rhn.pharmacy.api.PharmacyViews.InventoryPageView;
import com.rhn.pharmacy.api.PharmacyViews.InventoryTransactionView;
import com.rhn.pharmacy.api.PharmacyViews.InventoryTransactionPageView;
import com.rhn.pharmacy.api.PharmacyViews.DispenseCancelResultView;
import com.rhn.pharmacy.api.PharmacyViews.DispenseTraceView;
import com.rhn.pharmacy.api.PharmacyViews.MedicationDispenseView;
import com.rhn.pharmacy.api.PharmacyViews.PreparationResultView;
import com.rhn.pharmacy.api.PharmacyViews.ReservationResultView;
import com.rhn.pharmacy.api.PharmacyViews.StockReturnView;
import com.rhn.pharmacy.api.PharmacyViews.StockBinView;
import com.rhn.pharmacy.api.PharmacyViews.StockLotView;
import com.rhn.pharmacy.api.InventoryTraceViews.TraceCodeView;
import com.rhn.pharmacy.api.InventoryTraceViews.TraceCodeBatchScanView;
import com.rhn.pharmacy.application.InventoryApplicationService;
import com.rhn.pharmacy.application.DispenseApplicationService;
import com.rhn.pharmacy.application.InventoryTraceApplicationService;
import com.rhn.pharmacy.application.DispenseApplicationService.CancelDispenseCommand;
import com.rhn.pharmacy.application.DispenseApplicationService.CompletePickingCommand;
import com.rhn.pharmacy.application.DispenseApplicationService.DispenseCommand;
import com.rhn.pharmacy.application.DispenseApplicationService.ReturnCommand;
import com.rhn.pharmacy.application.DispenseApplicationService.ReturnLineCommand;
import com.rhn.pharmacy.application.InventoryApplicationService.CreateBinCommand;
import com.rhn.pharmacy.application.InventoryApplicationService.CreateLotCommand;
import com.rhn.pharmacy.application.InventoryApplicationService.ReceiveCommand;
import com.rhn.pharmacy.application.InventoryApplicationService.ReleaseCommand;
import com.rhn.pharmacy.application.InventoryApplicationService.ReserveCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
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
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/pharmacy")
public class InventoryController {
    private final InventoryApplicationService service;
    private final DispenseApplicationService dispenseService;
    private final InventoryTraceApplicationService traceService;

    public InventoryController(InventoryApplicationService service, DispenseApplicationService dispenseService,
                               InventoryTraceApplicationService traceService) {
        this.service = service; this.dispenseService = dispenseService; this.traceService = traceService;
    }

    @PostMapping("/stock-sites/{siteId}/stock-bins")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_ADJUST)
    @ResponseStatus(HttpStatus.CREATED)
    StockBinView createBin(@PathVariable Long siteId, @Valid @RequestBody CreateBinRequest input) {
        return service.createBin(siteId, input.command());
    }

    @GetMapping("/stock-sites/{siteId}/stock-bins")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    List<StockBinView> bins(@PathVariable Long siteId) { return service.bins(siteId); }

    @PostMapping("/stock-items/{stockItemId}/lots")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_ADJUST)
    @ResponseStatus(HttpStatus.CREATED)
    StockLotView createLot(@PathVariable Long stockItemId, @Valid @RequestBody CreateLotRequest input) {
        return service.createLot(stockItemId, input.command());
    }

    @GetMapping("/stock-items/{stockItemId}/lots")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    List<StockLotView> lots(@PathVariable Long stockItemId) { return service.lots(stockItemId); }

    @PostMapping("/inventory/receipts")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_RECEIVE)
    @ResponseStatus(HttpStatus.CREATED)
    InventoryTransactionView receive(@Valid @RequestBody InventoryReceiptRequest input) { return service.receive(input.command()); }

    @GetMapping("/inventory/balances")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    List<InventoryBalanceView> balances(@RequestParam Long stockSiteId,
                                        @RequestParam(required = false) Long stockItemId) {
        return service.balances(stockSiteId, stockItemId);
    }

    @GetMapping("/inventory/balances/page")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    InventoryPageView<InventoryBalanceView> balancePage(@RequestParam Long stockSiteId,
                                                         @RequestParam(required = false) Long stockItemId,
                                                         @RequestParam(defaultValue = "0") @Min(0) int page,
                                                         @RequestParam(defaultValue = "50") @Min(1) @Max(200) int size) {
        return service.balancePage(stockSiteId, stockItemId, page, size);
    }

    @GetMapping("/inventory/balances/summary")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    com.rhn.pharmacy.api.PharmacyViews.InventoryBalanceSummaryView balanceSummary(
            @RequestParam Long stockSiteId) {
        return service.balanceSummary(stockSiteId);
    }

    @GetMapping("/inventory/transactions")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    List<InventoryTransactionView> transactions(@RequestParam Long stockSiteId,
                                                 @RequestParam(required = false) String periodCode,
                                                 @RequestParam(required = false) Long stockItemId,
                                                 @RequestParam(defaultValue = "false") boolean allPeriods) {
        return service.transactions(stockSiteId, periodCode, stockItemId, allPeriods);
    }

    @GetMapping("/inventory/transactions/page")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    InventoryTransactionPageView transactionPage(
            @RequestParam Long stockSiteId,
            @RequestParam(required = false) String periodCode,
            @RequestParam(required = false) Long stockItemId,
            @RequestParam(defaultValue = "false") boolean allPeriods,
            @RequestParam(required = false) @Size(max = 100) String query,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "50") @Min(1) @Max(200) int size) {
        return service.transactionPage(stockSiteId, periodCode, stockItemId, allPeriods, query, page, size);
    }

    @GetMapping("/dispense/trace-code")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.PHARMACY_DISPENSE)
    TraceCodeView scanTraceCode(@RequestParam Long stockSiteId,
                                @RequestParam @NotBlank @Size(max = 256) String traceCode) {
        return traceService.scan(stockSiteId, traceCode);
    }

    @PostMapping("/dispense/trace-codes/scan")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.PHARMACY_DISPENSE)
    TraceCodeBatchScanView scanTraceCodes(@Valid @RequestBody BatchTraceScanRequest input) {
        return traceService.scanBatch(input.stockSiteId(), input.traceCodes());
    }

    @PostMapping("/dispense-tasks/{taskId}/reservations")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.PHARMACY_DISPENSE)
    ReservationResultView reserve(@PathVariable Long taskId, @Valid @RequestBody ReserveRequest input) {
        return service.reserveTask(taskId, new ReserveCommand(input.expiryMinutes()));
    }

    @GetMapping("/dispense-tasks/{taskId}/reservations")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.PHARMACY_DISPENSE)
    ReservationResultView reservations(@PathVariable Long taskId) { return service.reservations(taskId); }

    @PostMapping("/dispense-tasks/{taskId}/reservations/release")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.PHARMACY_DISPENSE)
    ReservationResultView release(@PathVariable Long taskId, @Valid @RequestBody ReleaseRequest input) {
        return service.releaseTask(taskId, new ReleaseCommand(input.reason()));
    }

    @PostMapping("/dispense-tasks/{taskId}/picking/complete")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.PHARMACY_DISPENSE)
    PreparationResultView completePicking(@PathVariable Long taskId,
                                          @Valid @RequestBody CompletePickingRequest input) {
        return dispenseService.completePicking(taskId, input.command());
    }

    @PostMapping("/dispense-tasks/{taskId}/dispenses")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.PHARMACY_DISPENSE)
    @ResponseStatus(HttpStatus.CREATED)
    MedicationDispenseView dispense(@PathVariable Long taskId, @Valid @RequestBody DispenseRequest input) {
        return dispenseService.dispense(taskId, input.command());
    }

    @PostMapping("/dispenses/{dispenseId}/returns")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.PHARMACY_DISPENSE)
    @ResponseStatus(HttpStatus.CREATED)
    StockReturnView returnMedication(@PathVariable Long dispenseId, @Valid @RequestBody ReturnRequest input) {
        return dispenseService.returnMedication(dispenseId, input.command());
    }

    @GetMapping("/dispense-tasks/{taskId}/trace")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.PHARMACY_DISPENSE)
    DispenseTraceView trace(@PathVariable Long taskId) { return dispenseService.trace(taskId); }

    /** 批量读取发药轨迹：退药勾选多项时一次取回全部轨迹，避免逐项请求。 */
    @GetMapping("/dispense-tasks/traces")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.PHARMACY_DISPENSE)
    List<DispenseTraceView> traces(@RequestParam List<Long> taskIds) {
        return dispenseService.traces(taskIds);
    }

    @PostMapping("/dispense-tasks/{taskId}/cancel-dispense")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.PHARMACY_DISPENSE)
    DispenseCancelResultView cancelDispense(@PathVariable Long taskId,
                                           @Valid @RequestBody CancelDispenseRequest input) {
        return dispenseService.cancelDispense(taskId, input.command());
    }

    /** 整批取消发药：一次请求撤销多张处方任务的发药，任一任务不可取消则整批回滚。 */
    @PostMapping("/dispense-tasks/cancel-dispense")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.PHARMACY_DISPENSE)
    java.util.List<DispenseCancelResultView> cancelDispenseBatch(@Valid @RequestBody CancelDispenseBatchRequest input) {
        return dispenseService.cancelDispenseBatch(input.taskIds(), input.template());
    }

    record CancelDispenseBatchRequest(
            @NotEmpty java.util.List<@NotNull Long> taskIds,
            @NotNull Long operatorPractitionerId,
            @NotNull Long operatorAssignmentId,
            String reasonCode,
            String description,
            Instant occurredAt
    ) {
        /** 取消编码由服务端按任务生成，这里只带共享的操作人、原因与发生时间。 */
        CancelDispenseCommand template() {
            return new CancelDispenseCommand(null, operatorPractitionerId, operatorAssignmentId, reasonCode,
                    description, occurredAt);
        }
    }

    record CancelDispenseRequest(
            @NotBlank @Size(max = 128) String cancelNo,
            @NotNull Long operatorPractitionerId,
            @NotNull Long operatorAssignmentId,
            String reasonCode,
            String description,
            Instant occurredAt
    ) {
        public CancelDispenseCommand command() {
            return new CancelDispenseCommand(
                    cancelNo, operatorPractitionerId, operatorAssignmentId, reasonCode, description, occurredAt
            );
        }
    }

    record CreateBinRequest(
            Long parentBinId, @NotBlank @Size(max = 64) String code,
            @NotBlank @Size(max = 200) String name,
            @NotBlank @Pattern(regexp = "ZONE|RACK|BIN|COUNTER|TRANSIT") String binType,
            @NotBlank @Pattern(regexp = "AVAILABLE|PENDING|QUARANTINE|DAMAGED|EXPIRED") String stockDefault,
            boolean receiveAllowed, boolean pickAllowed, boolean countAllowed,
            @Min(0) int sortOrder) {
        CreateBinCommand command() { return new CreateBinCommand(parentBinId, code, name, binType,
                stockDefault, receiveAllowed, pickAllowed, countAllowed, sortOrder); }
    }

    record CreateLotRequest(
            @NotBlank @Size(max = 128) String lotNo,
            LocalDate productionDate, LocalDate expiryDate,
            @Size(max = 128) String approvalCodeSnapshot,
            @Size(max = 300) String manufacturerNameSnapshot,
            @NotBlank @Pattern(regexp = "PENDING|QUALIFIED|QUARANTINE|REJECTED|RECALLED") String qualityStatus) {
        CreateLotCommand command() { return new CreateLotCommand(lotNo, productionDate, expiryDate,
                approvalCodeSnapshot, manufacturerNameSnapshot, qualityStatus); }
    }

    record InventoryReceiptRequest(
            @NotBlank @Size(max = 128) String requestCode,
            @NotBlank @Size(max = 128) String sourceCode,
            @NotNull Long stockItemId, Long stockBinId, @NotNull Long stockLotId,
            @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 20, fraction = 8)
            BigDecimal operationQuantity,
            @DecimalMin("0") @Digits(integer = 18, fraction = 6) BigDecimal unitCost,
            @NotNull Instant occurredAt, @Size(max = 1000) String description) {
        ReceiveCommand command() { return new ReceiveCommand(requestCode, sourceCode, stockItemId,
                stockBinId, stockLotId, operationQuantity, unitCost, occurredAt, description); }
    }

    record ReserveRequest(@Min(1) @Max(1440) Integer expiryMinutes) {}
    record ReleaseRequest(@NotBlank @Size(max = 1000) String reason) {}

    record CompletePickingRequest(@NotNull Long pickerPractitionerId, @NotNull Long pickerAssignmentId,
                                  @Size(max = 1000) String description) {
        CompletePickingCommand command() {
            return new CompletePickingCommand(pickerPractitionerId, pickerAssignmentId, description);
        }
    }

    record DispenseRequest(
            @NotBlank @Size(max = 128) String requestCode,
            @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 20, fraction = 8)
            BigDecimal operationQuantity,
            Instant occurredAt, @NotNull Long dispenserPractitionerId, @NotNull Long dispenserAssignmentId,
            Long checkerPractitionerId, Long checkerAssignmentId, @Size(max = 1000) String description,
            @Size(max = 1000) List<@NotNull Long> traceCodeIds) {
        DispenseCommand command() { return new DispenseCommand(requestCode, operationQuantity, occurredAt,
                dispenserPractitionerId, dispenserAssignmentId, checkerPractitionerId, checkerAssignmentId,
                description, traceCodeIds == null ? List.of() : traceCodeIds); }
    }

    record BatchTraceScanRequest(
            @NotNull Long stockSiteId,
            @NotNull @Size(min = 1, max = 200) List<@NotBlank @Size(max = 256) String> traceCodes) {}

    record ReturnLineRequest(
            @NotNull Long originalDispenseLineId,
            @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 20, fraction = 8)
            BigDecimal quantity,
            @NotBlank @Pattern(regexp = "RESTOCK|QUARANTINE|DESTROY") String disposition,
            @Size(max = 1000) String exceptionDescription) {
        ReturnLineCommand command() {
            return new ReturnLineCommand(originalDispenseLineId, quantity, disposition, exceptionDescription);
        }
    }

    record ReturnRequest(
            @NotBlank @Size(max = 64) String returnNo,
            @NotBlank @Size(max = 64) String reasonCode,
            Instant occurredAt, @NotNull Long processorPractitionerId, @NotNull Long processorAssignmentId,
            @Size(max = 1000) String description,
            @NotNull @Size(min = 1, max = 100) List<@Valid ReturnLineRequest> lines) {
        ReturnCommand command() { return new ReturnCommand(returnNo, reasonCode, occurredAt,
                processorPractitionerId, processorAssignmentId, description,
                lines.stream().map(ReturnLineRequest::command).toList()); }
    }
}
