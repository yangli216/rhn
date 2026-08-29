package com.rhn.billing.web;

import com.rhn.billing.api.BillingViews.AccountStatementView;
import com.rhn.billing.api.BillingViews.ChargeSynchronizationView;
import com.rhn.billing.api.BillingViews.BillingWorkItemView;
import com.rhn.billing.api.BillingViews.DailyReconciliationView;
import com.rhn.billing.api.BillingViews.InvoiceView;
import com.rhn.billing.api.BillingViews.PaymentView;
import com.rhn.billing.application.BillingApplicationService;
import com.rhn.billing.application.BillingApplicationService.IssueInvoiceCommand;
import com.rhn.billing.application.BillingApplicationService.PaymentCommand;
import com.rhn.billing.application.BillingApplicationService.RefundCommand;
import com.rhn.billing.application.BillingApplicationService.SynchronizeCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
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

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/billing")
public class BillingController {
    private final BillingApplicationService service;

    public BillingController(BillingApplicationService service) { this.service = service; }

    @PostMapping("/encounters/{encounterId}/charges/synchronize")
    ChargeSynchronizationView synchronize(@PathVariable Long encounterId,
                                          @Valid @RequestBody SynchronizeRequest input) {
        return service.synchronizeMedicationCharges(encounterId, new SynchronizeCommand(input.requestCode()));
    }

    @GetMapping("/worklist")
    List<BillingWorkItemView> worklist() { return service.worklist(); }

    @GetMapping("/encounters/{encounterId}/statement")
    AccountStatementView statement(@PathVariable Long encounterId,
                                   @RequestParam(defaultValue = "CNY") String currencyCode) {
        return service.encounterStatement(encounterId, currencyCode);
    }

    @PostMapping("/accounts/{accountId}/invoices")
    @ResponseStatus(HttpStatus.CREATED)
    InvoiceView issueInvoice(@PathVariable Long accountId, @Valid @RequestBody IssueInvoiceRequest input) {
        return service.issueInvoice(accountId, new IssueInvoiceCommand(input.invoiceNo(), input.issuedAt()));
    }

    @PostMapping("/invoices/{invoiceId}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    PaymentView collect(@PathVariable Long invoiceId, @Valid @RequestBody PaymentRequest input) {
        return service.collectPayment(invoiceId, new PaymentCommand(input.paymentNo(), input.paymentMethodCode(),
                input.paymentSceneCode(), input.amount(), input.paidAt(), input.externalTransactionNo(), input.description()));
    }

    @PostMapping("/payments/{paymentId}/refunds")
    @ResponseStatus(HttpStatus.CREATED)
    PaymentView refund(@PathVariable Long paymentId, @Valid @RequestBody RefundRequest input) {
        return service.refundPayment(paymentId, new RefundCommand(input.refundNo(), input.amount(),
                input.refundedAt(), input.externalTransactionNo(), input.reason()));
    }

    @GetMapping("/reconciliation/daily")
    DailyReconciliationView reconcile(@RequestParam LocalDate businessDate) {
        return service.dailyReconciliation(businessDate);
    }

    record SynchronizeRequest(@NotBlank @Size(max = 128) String requestCode) {}
    record IssueInvoiceRequest(@NotBlank @Size(max = 64) String invoiceNo, Instant issuedAt) {}
    record PaymentRequest(
            @NotBlank @Size(max = 64) String paymentNo,
            @NotBlank @Size(max = 128) String paymentMethodCode,
            @Size(max = 128) String paymentSceneCode,
            @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 18, fraction = 6)
            BigDecimal amount,
            Instant paidAt, @Size(max = 128) String externalTransactionNo,
            @Size(max = 1000) String description) {}
    record RefundRequest(
            @NotBlank @Size(max = 64) String refundNo,
            @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 18, fraction = 6)
            BigDecimal amount,
            Instant refundedAt, @Size(max = 128) String externalTransactionNo,
            @NotBlank @Size(max = 1000) String reason) {}
}
