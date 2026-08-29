package com.rhn.pharmacy.web;

import com.rhn.pharmacy.api.InventoryTraceViews.ReceiptTraceSummaryView;
import com.rhn.pharmacy.api.InventoryTraceViews.TraceCodeView;
import com.rhn.pharmacy.api.InventoryTraceViews.TraceDetailView;
import com.rhn.pharmacy.application.InventoryTraceApplicationService;
import com.rhn.pharmacy.application.InventoryTraceApplicationService.RegisterReceiptCodesCommand;
import com.rhn.pharmacy.application.InventoryTraceApplicationService.RegisterReceiptLineCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/pharmacy")
public class InventoryTraceController {
    private final InventoryTraceApplicationService service;
    public InventoryTraceController(InventoryTraceApplicationService service) { this.service = service; }

    @PostMapping("/goods-receipts/{receiptId}/trace-codes")
    ReceiptTraceSummaryView register(@PathVariable Long receiptId,
                                     @Valid @RequestBody RegisterReceiptCodesRequest input) {
        return service.registerReceiptCodes(receiptId, input.command());
    }

    @GetMapping("/goods-receipts/{receiptId}/trace-codes/summary")
    ReceiptTraceSummaryView summary(@PathVariable Long receiptId) { return service.receiptSummary(receiptId); }

    @GetMapping("/inventory/trace-codes")
    List<TraceCodeView> search(@RequestParam Long stockSiteId,
                               @RequestParam(required = false) String status,
                               @RequestParam(required = false) String query) {
        return service.search(stockSiteId, status, query);
    }

    @GetMapping("/inventory/trace-codes/{id}")
    TraceDetailView detail(@PathVariable Long id) { return service.detail(id); }

    record RegisterReceiptLineRequest(@NotNull Long goodsReceiptLineId,
                                      @NotNull @Size(max = 1000) List<@Size(max = 256) String> traceCodes) {
        RegisterReceiptLineCommand command() { return new RegisterReceiptLineCommand(goodsReceiptLineId, traceCodes); }
    }
    record RegisterReceiptCodesRequest(@NotNull @Size(min = 1, max = 500)
                                       List<@Valid RegisterReceiptLineRequest> lines) {
        RegisterReceiptCodesCommand command() { return new RegisterReceiptCodesCommand(
                lines.stream().map(RegisterReceiptLineRequest::command).toList()); }
    }
}
