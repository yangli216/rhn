package com.rhn.billing.web;

import com.rhn.billing.api.ReceiptViews.ReceiptView;
import com.rhn.billing.application.ReceiptApplicationService;
import com.rhn.billing.application.ReceiptApplicationService.IssueReceiptCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/billing")
public class BillingReceiptController {
    private final ReceiptApplicationService service;
    public BillingReceiptController(ReceiptApplicationService service) { this.service = service; }

    @PostMapping("/settlements/{settlementId}/receipts")
    @ResponseStatus(HttpStatus.CREATED)
    ReceiptView issue(@PathVariable Long settlementId, @Valid @RequestBody IssueReceiptRequest input) {
        return service.issue(new IssueReceiptCommand(settlementId, input.idempotencyKey(), input.receiptType(),
                input.issueChannel(), input.fiscalAuthorityCode(), input.payerName(), input.payerIdentityDigest(),
                input.correlationId()));
    }

    @GetMapping("/settlements/{settlementId}/receipts")
    List<ReceiptView> list(@PathVariable Long settlementId) { return service.listBySettlement(settlementId); }

    @GetMapping("/receipts/{receiptId}")
    ReceiptView get(@PathVariable Long receiptId) { return service.get(receiptId); }

    @PostMapping("/receipts/{receiptId}/issue/retry")
    ReceiptView retry(@PathVariable Long receiptId, @Valid @RequestBody ReceiptOperationRequest input) {
        return service.retry(receiptId, input.commandCode(), input.reason());
    }

    @PostMapping("/receipts/{receiptId}/issue/query")
    ReceiptView query(@PathVariable Long receiptId, @Valid @RequestBody ReceiptOperationRequest input) {
        return service.query(receiptId, input.commandCode());
    }

    @PostMapping("/receipts/{receiptId}/void")
    ReceiptView voidReceipt(@PathVariable Long receiptId, @Valid @RequestBody VoidReceiptRequest input) {
        return service.voidReceipt(receiptId, input.commandCode(), input.reason());
    }

    @PostMapping("/receipts/{receiptId}/red-flush")
    @ResponseStatus(HttpStatus.CREATED)
    ReceiptView redFlush(@PathVariable Long receiptId, @Valid @RequestBody RedFlushReceiptRequest input) {
        return service.redFlush(receiptId, input.commandCode(), input.reason(), input.correlationId());
    }

    @PostMapping("/receipts/{receiptId}/prints")
    ReceiptView print(@PathVariable Long receiptId, @Valid @RequestBody PrintReceiptRequest input) {
        return service.print(receiptId, input.commandCode());
    }

    @GetMapping("/receipts/recovery-worklist")
    List<ReceiptView> recoveryWorklist(@RequestParam(defaultValue = "50") int limit) {
        return service.recoveryWorklist(limit);
    }

    @PostMapping("/receipts/recovery")
    List<ReceiptApplicationService.RecoveryResult> recover(@Valid @RequestBody RecoveryRequest input) {
        return service.recoverPending(input.batchCode(), input.limit() == null ? 50 : input.limit());
    }

    record IssueReceiptRequest(
            @NotBlank @Size(max = 128) String idempotencyKey,
            @NotBlank @Pattern(regexp = "MEDICAL_E_INVOICE|PAPER_INVOICE|RECEIPT|VIRTUAL") String receiptType,
            @NotBlank @Pattern(regexp = "CASHIER|SELF_SERVICE|MOBILE|ONLINE") String issueChannel,
            @Size(max = 128) String fiscalAuthorityCode, @Size(max = 300) String payerName,
            @Size(max = 256) String payerIdentityDigest, @Size(max = 128) String correlationId) {}
    record PrintReceiptRequest(@NotBlank @Size(max = 128) String commandCode) {}
    record ReceiptOperationRequest(@NotBlank @Size(max = 128) String commandCode,
                                   @Size(max = 500) String reason) {}
    record VoidReceiptRequest(@NotBlank @Size(max = 128) String commandCode,
                              @NotBlank @Size(max = 500) String reason) {}
    record RedFlushReceiptRequest(@NotBlank @Size(max = 128) String commandCode,
                                  @NotBlank @Size(max = 500) String reason,
                                  @Size(max = 128) String correlationId) {}
    record RecoveryRequest(@NotBlank @Size(max = 96) String batchCode,
                           @jakarta.validation.constraints.Min(1)
                           @jakarta.validation.constraints.Max(100) Integer limit) {}
}
