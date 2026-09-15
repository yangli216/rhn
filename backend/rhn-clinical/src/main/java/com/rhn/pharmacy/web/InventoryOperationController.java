package com.rhn.pharmacy.web;

import com.rhn.pharmacy.api.InventoryOperationViews.DocumentEventView;
import com.rhn.pharmacy.api.InventoryOperationViews.GoodsReceiptView;
import com.rhn.pharmacy.api.InventoryOperationViews.PurchaseOrderView;
import com.rhn.pharmacy.api.InventoryOperationViews.SupplierSupplyItemView;
import com.rhn.pharmacy.api.InventoryOperationViews.SupplierView;
import com.rhn.pharmacy.application.InventoryOperationApplicationService;
import com.rhn.pharmacy.application.InventoryOperationApplicationService.CreateGoodsReceiptCommand;
import com.rhn.pharmacy.application.InventoryOperationApplicationService.CreatePurchaseOrderCommand;
import com.rhn.pharmacy.application.InventoryOperationApplicationService.CreateSupplierCommand;
import com.rhn.pharmacy.application.InventoryOperationApplicationService.CreateSupplyItemCommand;
import com.rhn.pharmacy.application.InventoryOperationApplicationService.DecisionCommand;
import com.rhn.pharmacy.application.InventoryOperationApplicationService.GoodsReceiptLineCommand;
import com.rhn.pharmacy.application.InventoryOperationApplicationService.InspectGoodsReceiptCommand;
import com.rhn.pharmacy.application.InventoryOperationApplicationService.InspectLineCommand;
import com.rhn.pharmacy.application.InventoryOperationApplicationService.PurchaseLineCommand;
import com.rhn.pharmacy.application.InventoryOperationApplicationService.UpdateSupplierCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
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
import org.springframework.web.bind.annotation.PutMapping;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/pharmacy")
@PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_RECEIVE)
public class InventoryOperationController {
    private final InventoryOperationApplicationService service;

    public InventoryOperationController(InventoryOperationApplicationService service) { this.service = service; }

    @PostMapping("/suppliers")
    @ResponseStatus(HttpStatus.CREATED)
    SupplierView createSupplier(@Valid @RequestBody CreateSupplierRequest input) {
        return service.createSupplier(input.command());
    }

    @GetMapping("/suppliers")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    List<SupplierView> suppliers(@RequestParam(required = false) Long organizationId,
                                 @RequestParam(required = false) String query,
                                 @RequestParam(required = false) String status) {
        return service.suppliers(organizationId, query, status);
    }

    @PutMapping("/suppliers/{supplierId}")
    SupplierView updateSupplier(@PathVariable Long supplierId, @Valid @RequestBody UpdateSupplierRequest input) {
        return service.updateSupplier(supplierId, revision(input.expectedRevision()), input.command());
    }

    @PostMapping("/suppliers/{supplierId}/status")
    SupplierView supplierStatus(@PathVariable Long supplierId, @Valid @RequestBody SupplierStatusRequest input) {
        return service.changeSupplierStatus(supplierId, revision(input.expectedRevision()), input.status());
    }

    @PostMapping("/suppliers/{supplierId}/supply-items")
    @ResponseStatus(HttpStatus.CREATED)
    SupplierSupplyItemView createSupplyItem(@PathVariable Long supplierId,
                                            @Valid @RequestBody CreateSupplyItemRequest input) {
        return service.createSupplyItem(supplierId, input.command());
    }

    @GetMapping("/suppliers/{supplierId}/supply-items")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    List<SupplierSupplyItemView> supplyItems(@PathVariable Long supplierId) {
        return service.supplyItems(supplierId);
    }

    @PostMapping("/purchase-orders")
    @ResponseStatus(HttpStatus.CREATED)
    PurchaseOrderView createPurchaseOrder(@Valid @RequestBody CreatePurchaseOrderRequest input) {
        return service.createPurchaseOrder(input.command());
    }

    @GetMapping("/purchase-orders")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    List<PurchaseOrderView> purchaseOrders(@RequestParam Long stockSiteId) {
        return service.purchaseOrders(stockSiteId);
    }

    @PostMapping("/purchase-orders/{orderId}/submit")
    PurchaseOrderView submitPurchaseOrder(@PathVariable Long orderId) {
        return service.submitPurchaseOrder(orderId);
    }

    @PostMapping("/purchase-orders/{orderId}/approve")
    PurchaseOrderView approvePurchaseOrder(@PathVariable Long orderId,
                                            @Valid @RequestBody(required = false) DecisionRequest input) {
        return service.approvePurchaseOrder(orderId, input == null ? new DecisionCommand(null) : input.command());
    }

    @PostMapping("/purchase-orders/{orderId}/reject")
    PurchaseOrderView rejectPurchaseOrder(@PathVariable Long orderId, @Valid @RequestBody DecisionRequest input) {
        return service.rejectPurchaseOrder(orderId, input.command());
    }

    @PostMapping("/goods-receipts")
    @ResponseStatus(HttpStatus.CREATED)
    GoodsReceiptView createGoodsReceipt(@Valid @RequestBody CreateGoodsReceiptRequest input) {
        return service.createGoodsReceipt(input.command());
    }

    @GetMapping("/goods-receipts")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    List<GoodsReceiptView> goodsReceipts(@RequestParam Long stockSiteId) {
        return service.goodsReceipts(stockSiteId);
    }

    @PostMapping("/goods-receipts/{receiptId}/inspect")
    GoodsReceiptView inspectGoodsReceipt(@PathVariable Long receiptId,
                                         @Valid @RequestBody InspectGoodsReceiptRequest input) {
        return service.inspectGoodsReceipt(receiptId, input.command());
    }

    @PostMapping("/goods-receipts/{receiptId}/post")
    GoodsReceiptView postGoodsReceipt(@PathVariable Long receiptId) {
        return service.postGoodsReceipt(receiptId);
    }

    @GetMapping("/inventory-documents/{documentType}/{documentId}/events")
    @PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.WAREHOUSE_READ)
    List<DocumentEventView> documentEvents(@PathVariable String documentType, @PathVariable Long documentId) {
        return service.documentEvents(documentType, documentId);
    }

    record CreateSupplierRequest(
            Long organizationId, @NotBlank @Size(max = 64) String code, @NotBlank @Size(max = 300) String name,
            @Size(max = 64) String unifiedCreditCode, @Size(max = 128) String licenseNo,
            LocalDate licenseValidTo, @Size(max = 100) String contactName, @Size(max = 64) String contactPhone,
            LocalDate validFrom, LocalDate validTo) {
        CreateSupplierCommand command() { return new CreateSupplierCommand(organizationId, code, name,
                unifiedCreditCode, licenseNo, licenseValidTo, contactName, contactPhone, validFrom, validTo); }
    }

    record UpdateSupplierRequest(
            @NotNull @Min(0) BigInteger expectedRevision,
            @NotBlank @Size(max = 64) String code, @NotBlank @Size(max = 300) String name,
            @Size(max = 64) String unifiedCreditCode, @Size(max = 128) String licenseNo,
            LocalDate licenseValidTo, @Size(max = 100) String contactName, @Size(max = 64) String contactPhone,
            @NotNull LocalDate validFrom, LocalDate validTo,
            @NotBlank @Size(max = 32) String status) {
        UpdateSupplierCommand command() { return new UpdateSupplierCommand(code, name, unifiedCreditCode,
                licenseNo, licenseValidTo, contactName, contactPhone, validFrom, validTo, status); }
    }

    record SupplierStatusRequest(@NotNull @Min(0) BigInteger expectedRevision,
                                 @NotBlank @Size(max = 32) String status) {}

    private static long revision(BigInteger value) {
        try { return value.longValueExact(); }
        catch (ArithmeticException exception) { throw new IllegalArgumentException("修订号超出可支持范围"); }
    }

    record CreateSupplyItemRequest(
            @NotNull Long catalogItemId, @NotNull Long packageId,
            @NotNull @DecimalMin("0") @Digits(integer = 18, fraction = 6) BigDecimal agreementPrice,
            @DecimalMin("0") @DecimalMax("1") @Digits(integer = 1, fraction = 6) BigDecimal taxRate,
            LocalDate validFrom, LocalDate validTo) {
        CreateSupplyItemCommand command() { return new CreateSupplyItemCommand(catalogItemId, packageId,
                agreementPrice, taxRate, validFrom, validTo); }
    }

    record PurchaseLineRequest(
            @NotNull Long stockItemId, @NotNull Long packageId,
            @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 20, fraction = 8)
            BigDecimal orderedQuantity,
            @NotNull @DecimalMin("0") @Digits(integer = 18, fraction = 6) BigDecimal unitPrice,
            @DecimalMin("0") @DecimalMax("1") @Digits(integer = 1, fraction = 6) BigDecimal taxRate,
            @Size(max = 1000) String description) {
        PurchaseLineCommand command() { return new PurchaseLineCommand(stockItemId, packageId, orderedQuantity,
                unitPrice, taxRate, description); }
    }

    record CreatePurchaseOrderRequest(
            @NotNull Long stockSiteId, @NotNull Long supplierId, @Size(max = 64) String orderNo,
            @NotBlank @Size(max = 128) String requestCode, LocalDate orderDate, LocalDate expectedDate,
            @Size(max = 1000) String description,
            @NotNull @Size(min = 1, max = 500) List<@Valid PurchaseLineRequest> lines) {
        CreatePurchaseOrderCommand command() { return new CreatePurchaseOrderCommand(stockSiteId, supplierId,
                orderNo, requestCode, orderDate, expectedDate, description,
                lines.stream().map(PurchaseLineRequest::command).toList()); }
    }

    record DecisionRequest(@Size(max = 1000) String reason) {
        DecisionCommand command() { return new DecisionCommand(reason); }
    }

    record GoodsReceiptLineRequest(
            @NotNull Long purchaseOrderLineId, @NotNull Long destinationBinId,
            @NotBlank @Size(max = 128) String lotNo, LocalDate productionDate, LocalDate expiryDate,
            @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 20, fraction = 8)
            BigDecimal deliveredQuantity,
            @DecimalMin("0") @Digits(integer = 18, fraction = 6) BigDecimal unitCost) {
        GoodsReceiptLineCommand command() { return new GoodsReceiptLineCommand(purchaseOrderLineId,
                destinationBinId, lotNo, productionDate, expiryDate, deliveredQuantity, unitCost); }
    }

    record CreateGoodsReceiptRequest(
            @NotNull Long purchaseOrderId, @Size(max = 64) String receiptNo,
            @NotBlank @Size(max = 128) String requestCode, @Size(max = 128) String deliveryNoteNo,
            Instant receivedAt, @Size(max = 1000) String description,
            @NotNull @Size(min = 1, max = 500) List<@Valid GoodsReceiptLineRequest> lines) {
        CreateGoodsReceiptCommand command() { return new CreateGoodsReceiptCommand(purchaseOrderId, receiptNo,
                requestCode, deliveryNoteNo, receivedAt, description,
                lines.stream().map(GoodsReceiptLineRequest::command).toList()); }
    }

    record InspectLineRequest(
            @NotNull Long goodsReceiptLineId,
            @NotNull @DecimalMin("0") @Digits(integer = 20, fraction = 8) BigDecimal acceptedQuantity,
            @NotNull @DecimalMin("0") @Digits(integer = 20, fraction = 8) BigDecimal rejectedQuantity,
            @Size(max = 1000) String rejectionReason) {
        InspectLineCommand command() { return new InspectLineCommand(goodsReceiptLineId, acceptedQuantity,
                rejectedQuantity, rejectionReason); }
    }

    record InspectGoodsReceiptRequest(
            @Size(max = 1000) String description,
            @NotNull @Size(min = 1, max = 500) List<@Valid InspectLineRequest> lines) {
        InspectGoodsReceiptCommand command() { return new InspectGoodsReceiptCommand(description,
                lines.stream().map(InspectLineRequest::command).toList()); }
    }
}
