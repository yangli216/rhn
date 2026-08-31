package com.rhn.pharmacy.web;
import com.rhn.pharmacy.api.InventoryOperationViews.TransferView;
import com.rhn.pharmacy.application.StockTransferApplicationService;
import com.rhn.pharmacy.application.StockTransferApplicationService.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/pharmacy/stock-transfers")
@PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_TRANSFER)
public class StockTransferController {
    private final StockTransferApplicationService service;
    public StockTransferController(StockTransferApplicationService service){this.service=service;}
    @PostMapping @ResponseStatus(HttpStatus.CREATED) TransferView create(@Valid @RequestBody CreateRequest input){return service.create(input.command());}
    @GetMapping @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ) List<TransferView> list(@RequestParam Long stockSiteId,@RequestParam(required=false)String role){return service.list(stockSiteId,role);}
    @PostMapping("/{id}/submit") TransferView submit(@PathVariable Long id){return service.submit(id);}
    @PostMapping("/{id}/approve") TransferView approve(@PathVariable Long id,@Valid @RequestBody ApproveRequest input){return service.approve(id,input.command());}
    @PostMapping("/{id}/reject") TransferView reject(@PathVariable Long id,@Valid @RequestBody DecisionRequest input){return service.reject(id,new DecisionCommand(input.reason()));}
    @PostMapping("/{id}/pick") TransferView pick(@PathVariable Long id){return service.pick(id);}
    @PostMapping("/{id}/dispatch") TransferView dispatch(@PathVariable Long id){return service.dispatch(id);}
    @PostMapping("/{id}/receive") TransferView receive(@PathVariable Long id,@Valid @RequestBody ReceiveRequest input){return service.receive(id,input.command());}
    record LineRequest(@NotNull Long sourceStockItemId,@NotNull Long destinationStockItemId,@NotNull @DecimalMin(value="0",inclusive=false) @Digits(integer=20,fraction=8) BigDecimal requestedQuantity){TransferLineCommand command(){return new TransferLineCommand(sourceStockItemId,destinationStockItemId,requestedQuantity);}}
    record CreateRequest(@NotNull Long sourceSiteId,@NotNull Long destinationSiteId,@Size(max=64)String transferNo,@NotBlank @Size(max=128)String requestCode,Instant requestedAt,@Size(max=1000)String reason,@Size(max=1000)String description,@NotNull @Size(min=1,max=500)List<@Valid LineRequest> lines){CreateTransferCommand command(){return new CreateTransferCommand(sourceSiteId,destinationSiteId,transferNo,requestCode,requestedAt,reason,description,lines.stream().map(LineRequest::command).toList());}}
    record ApproveLineRequest(@NotNull Long transferLineId,@NotNull @DecimalMin("0") @Digits(integer=20,fraction=8)BigDecimal approvedQuantity){ApproveLineCommand command(){return new ApproveLineCommand(transferLineId,approvedQuantity);}}
    record ApproveRequest(@Size(max=1000)String reason,@NotNull @Size(min=1,max=500)List<@Valid ApproveLineRequest> lines){ApproveTransferCommand command(){return new ApproveTransferCommand(reason,lines.stream().map(ApproveLineRequest::command).toList());}}
    record DecisionRequest(@NotBlank @Size(max=1000)String reason){}
    record ReceiveAllocationRequest(@NotNull Long transferAllocationId,@NotNull Long destinationBinId,@NotNull @DecimalMin("0") @Digits(integer=20,fraction=8)BigDecimal receivedQuantity,@NotNull @DecimalMin("0") @Digits(integer=20,fraction=8)BigDecimal damagedQuantity,@Size(max=1000)String discrepancyReason){ReceiveAllocationCommand command(){return new ReceiveAllocationCommand(transferAllocationId,destinationBinId,receivedQuantity,damagedQuantity,discrepancyReason);}}
    record ReceiveRequest(@Size(max=1000)String reason,@NotNull @Size(min=1,max=1000)List<@Valid ReceiveAllocationRequest> allocations){ReceiveTransferCommand command(){return new ReceiveTransferCommand(reason,allocations.stream().map(ReceiveAllocationRequest::command).toList());}}
}
