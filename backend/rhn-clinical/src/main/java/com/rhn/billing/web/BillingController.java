package com.rhn.billing.web;

import com.rhn.billing.api.BillingViews.AccountStatementView;
import com.rhn.billing.api.BillingViews.CancelledSettlementView;
import com.rhn.billing.api.BillingViews.SettlementCashierView;
import com.rhn.billing.api.BillingViews.ChargeSynchronizationView;
import com.rhn.billing.api.BillingViews.BillingWorkItemView;
import com.rhn.billing.api.BillingWorkItemPageView;
import com.rhn.billing.api.BillingViews.DailyReconciliationView;
import com.rhn.billing.api.BillingViews.InvoiceView;
import com.rhn.billing.api.BillingViews.PaymentView;
import com.rhn.billing.api.BillingViews.SettlementView;
import com.rhn.billing.api.BillingViews.SettlementRecordView;
import com.rhn.billing.application.BillingApplicationService;
import com.rhn.billing.application.BillingApplicationService.IssueInvoiceCommand;
import com.rhn.billing.application.BillingApplicationService.PaymentCommand;
import com.rhn.billing.application.BillingApplicationService.RefundCommand;
import com.rhn.billing.application.BillingApplicationService.SynchronizeCommand;
import com.rhn.billing.application.PaymentOrchestrationService;
import com.rhn.billing.api.ReliefViews;
import com.rhn.billing.application.SettlementApplicationService;
import com.rhn.billing.application.PaymentOrchestrationService.CreatePaymentOrderCommand;
import com.rhn.billing.application.PaymentOrchestrationService.CreateRefundOrderCommand;
import com.rhn.billing.api.PaymentResultDirectory.PaymentOrderView;
import com.rhn.billing.api.RefundPreCheckViews.DirectRefundCommand;
import com.rhn.billing.api.RefundPreCheckViews.RefundPreCheckSummaryView;
import com.rhn.billing.application.DirectRefundApplicationService;
import com.rhn.billing.application.RefundPreCheckService;
import com.rhn.billing.application.SettlementCancellationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.format.annotation.DateTimeFormat;
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
    private final PaymentOrchestrationService payments;
    private final SettlementApplicationService settlements;
    private final RefundPreCheckService refundPreCheckService;
    private final DirectRefundApplicationService directRefundService;
    private final SettlementCancellationService cancellations;
    private final com.rhn.billing.application.SettlementExceptionService settlementExceptions;

    public BillingController(BillingApplicationService service, PaymentOrchestrationService payments,
                             SettlementApplicationService settlements,
                             RefundPreCheckService refundPreCheckService,
                             DirectRefundApplicationService directRefundService,
                             SettlementCancellationService cancellations,
                             com.rhn.billing.application.SettlementExceptionService settlementExceptions) {
        this.service = service; this.payments = payments; this.settlements = settlements;
        this.refundPreCheckService = refundPreCheckService;
        this.directRefundService = directRefundService;
        this.cancellations = cancellations;
        this.settlementExceptions = settlementExceptions;
    }

    @PostMapping("/encounters/{encounterId}/charges/synchronize")
    ChargeSynchronizationView synchronize(@PathVariable Long encounterId,
                                          @Valid @RequestBody SynchronizeRequest input) {
        return service.synchronizeMedicationCharges(encounterId, new SynchronizeCommand(input.requestCode()));
    }

    @GetMapping("/worklist")
    List<BillingWorkItemView> worklist() { return service.worklist(); }

    @GetMapping("/settled-encounters")
    BillingWorkItemPageView settledEncounters(
            @RequestParam(required = false) @DateTimeFormat(
                    iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
            @RequestParam(required = false) @DateTimeFormat(
                    iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
            @RequestParam(required = false) String query,
            @RequestParam(required = false) Long encounterId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.settledEncounters(dateFrom, dateTo, query, encounterId, page, size);
    }

    @GetMapping("/encounters/{encounterId}/statement")
    AccountStatementView statement(@PathVariable Long encounterId,
                                   @RequestParam(defaultValue = "CNY") String currencyCode) {
        return service.encounterStatement(encounterId, currencyCode);
    }

    @PostMapping("/accounts/{accountId}/invoices")
    @ResponseStatus(HttpStatus.CREATED)
    InvoiceView issueInvoice(@PathVariable Long accountId, @Valid @RequestBody IssueInvoiceRequest input) {
        return service.issueInvoice(accountId, new IssueInvoiceCommand(input.invoiceNo(), input.issuedAt(),
                input.settlementScene(), input.terminalScene(), input.terminalCode(), input.chargeItemIds(),
                input.settlementMode()));
    }

    @PostMapping("/invoices/{invoiceId}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    PaymentView collect(@PathVariable Long invoiceId, @Valid @RequestBody PaymentRequest input) {
        return service.collectPayment(invoiceId, new PaymentCommand(input.paymentNo(), input.paymentMethodCode(),
                input.paymentSceneCode(), input.amount(), input.paidAt(), input.externalTransactionNo(), input.description(), null, input.roundingAdjustment()));
    }

    @PostMapping("/settlements/{settlementId}/payment-orders")
    @ResponseStatus(HttpStatus.CREATED)
    PaymentOrderView createPaymentOrder(@PathVariable Long settlementId,
                                        @Valid @RequestBody PaymentOrderRequest input) {
        return payments.create(new CreatePaymentOrderCommand(settlementId, input.idempotencyKey(),
                input.businessScene(), input.paymentSceneCode(), input.paymentMethodCode(), input.amount(),
                input.roundingAdjustment(), input.correlationId(), input.terminalCode(), input.expiresAt(), input.authorizationCode()));
    }

    @GetMapping("/payment-orders/{paymentOrderId}")
    PaymentOrderView paymentOrder(@PathVariable Long paymentOrderId) {
        return payments.get(paymentOrderId);
    }

    @PostMapping("/payment-orders/{paymentOrderId}/query")
    PaymentOrderView queryPaymentOrder(@PathVariable Long paymentOrderId) {
        return payments.query(paymentOrderId);
    }

    @PostMapping("/payment-orders/{paymentOrderId}/cancel")
    PaymentOrderView cancelPaymentOrder(@PathVariable Long paymentOrderId) {
        return payments.cancel(paymentOrderId);
    }

    @GetMapping("/payment-orders/recovery-worklist")
    List<PaymentOrderView> paymentRecoveryWorklist(@RequestParam(defaultValue = "50") int limit) {
        return payments.recoveryWorklist(limit);
    }

    @PostMapping("/payment-orders/recovery")
    List<PaymentOrchestrationService.RecoveryResult> recoverPayments(
            @Valid @RequestBody PaymentRecoveryRequest input) {
        return payments.recoverPending(input.batchCode(), input.limit());
    }

    @PostMapping("/payment-orders/{paymentOrderId}/business-completion/retry")
    PaymentOrderView retryBusinessCompletion(@PathVariable Long paymentOrderId) {
        return payments.retryBusinessCompletion(paymentOrderId);
    }

    @GetMapping("/settlements/{settlementId}/relief")
    ReliefViews.SettlementReliefView settlementRelief(@PathVariable Long settlementId) {
        return settlements.relief(settlementId);
    }

    @PostMapping("/settlements/{settlementId}/relief/confirm")
    ReliefViews.SettlementReliefView confirmSettlementRelief(@PathVariable Long settlementId,
                                                             @Valid @RequestBody ConfirmReliefRequest input) {
        return settlements.confirmRelief(settlementId, new SettlementApplicationService.ConfirmReliefCommand(
                input.manual() == null ? List.of() : input.manual().stream()
                        .map(item -> new SettlementApplicationService.ManualReliefInput(item.policyId(), item.amount(),
                                item.reason(), item.evidence())).toList()));
    }

    /** 取消未付款结算单，所含收费回到待结算。 */
    @PostMapping("/settlements/{settlementId}/cancel")
    CancelledSettlementView cancelSettlement(@PathVariable Long settlementId, @Valid @RequestBody CancelSettlementRequest input) {
        return cancellations.cancel(settlementId, input.reason());
    }

    /** 医生修改已进结算单的医嘱、诊毕放弃收款时，取消本就诊全部未付款结算单。 */
    @PostMapping("/encounters/{encounterId}/unpaid-settlements/cancel")
    List<CancelledSettlementView> cancelUnpaidSettlements(@PathVariable Long encounterId,
                                                          @Valid @RequestBody CancelSettlementRequest input) {
        return cancellations.cancelUnpaidForEncounter(encounterId, input.reason());
    }

    @GetMapping("/settlements/{settlementId}")
    SettlementView settlement(@PathVariable Long settlementId) {
        return settlements.get(settlementId);
    }

    /** 异常结算（含单边账）待办：实时推导，处理完成后自动消失。 */
    @GetMapping("/settlement-exceptions")
    List<com.rhn.billing.api.BillingViews.SettlementExceptionView> settlementExceptions(
            @RequestParam(defaultValue = "100") int limit) {
        return settlementExceptions.exceptions(limit);
    }

    @GetMapping("/settlement-records")
    List<SettlementRecordView> settlementRecords(@RequestParam(defaultValue = "200") int limit,
            @RequestParam(required = false) java.time.LocalDate from, @RequestParam(required = false) java.time.LocalDate to,
            @RequestParam(required = false) String cashier, @RequestParam(required = false) String terminalScene,
            @RequestParam(defaultValue = "false") boolean includeOpen) {
        if (from != null || to != null || cashier != null || terminalScene != null || includeOpen) {
            return settlements.completedInRange(limit, from, to, cashier, terminalScene, includeOpen);
        }
        return settlements.recentCompleted(limit);
    }

    /** 收费查询的办理人选项：收费岗位在岗人员 + 所选日期范围内实际办理过结算的人员。 */
    @GetMapping("/settlement-cashiers")
    List<SettlementCashierView> settlementCashiers(@RequestParam java.time.LocalDate from, @RequestParam java.time.LocalDate to,
            @RequestParam(required = false) String terminalScene) {
        return settlements.settlementCashiers(from, to, terminalScene);
    }

    @GetMapping("/accounts/{accountId}/payment-orders")
    List<PaymentOrderView> paymentOrders(@PathVariable Long accountId) {
        return payments.listByAccount(accountId);
    }

    @PostMapping("/payments/{paymentId}/refunds")
    @ResponseStatus(HttpStatus.CREATED)
    PaymentView refund(@PathVariable Long paymentId, @Valid @RequestBody RefundRequest input) {
        return service.refundPayment(paymentId, new RefundCommand(input.refundNo(), input.amount(),
                input.refundedAt(), input.externalTransactionNo(), input.reason(), null, null));
    }

    @PostMapping("/payments/{paymentId}/refund-orders")
    @ResponseStatus(HttpStatus.CREATED)
    PaymentOrderView createRefundOrder(@PathVariable Long paymentId,
                                       @Valid @RequestBody RefundOrderRequest input) {
        return payments.refund(new CreateRefundOrderCommand(paymentId, input.idempotencyKey(), input.amount(),
                input.reason(), input.correlationId(), input.terminalCode()));
    }

    @GetMapping("/reconciliation/daily")
    DailyReconciliationView reconcile(@RequestParam LocalDate businessDate) {
        return service.dailyReconciliation(businessDate);
    }

    @GetMapping("/encounters/{encounterId}/refund-precheck")
    public RefundPreCheckSummaryView getRefundPreCheck(@PathVariable Long encounterId,
                                                       @RequestParam(required = false) Long accountId) {
        return refundPreCheckService.preCheck(encounterId, accountId);
    }

    @PostMapping("/payments/{paymentId}/direct-refund")
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentOrderView directRefund(@PathVariable Long paymentId,
                                         @Valid @RequestBody DirectRefundRequest input) {
        return directRefundService.directRefund(paymentId, new DirectRefundCommand(
                input.idempotencyKey(),
                input.refundAmount(),
                input.reason(),
                input.terminalCode(),
                input.chargeItemIds()
        ));
    }

    record ManualReliefRequest(@NotNull Long policyId,
                               @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 18, fraction = 2) BigDecimal amount,
                               @NotBlank @Size(max = 1000) String reason, @Size(max = 1000) String evidence) {}
    record ConfirmReliefRequest(List<@Valid ManualReliefRequest> manual) {}
    record CancelSettlementRequest(@NotBlank @Size(max = 200) String reason) {}
    record SynchronizeRequest(@NotBlank @Size(max = 128) String requestCode) {}
    record IssueInvoiceRequest(
            @NotBlank @Size(max = 64) String invoiceNo, Instant issuedAt,
            @Size(max = 32) String settlementScene,
            @Size(max = 32) String terminalScene,
            @Size(max = 128) String terminalCode,
            List<Long> chargeItemIds,
            @Pattern(regexp = "SELF_PAY|MEDICAL_INSURANCE") String settlementMode) {}
    record PaymentRequest(
            @NotBlank @Size(max = 64) String paymentNo,
            @NotBlank @Size(max = 128) String paymentMethodCode,
            @Size(max = 128) String paymentSceneCode,
            @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 18, fraction = 6)
            BigDecimal amount,
            @Digits(integer = 18, fraction = 6) BigDecimal roundingAdjustment,
            Instant paidAt, @Size(max = 128) String externalTransactionNo,
            @Size(max = 1000) String description) {}
    record PaymentOrderRequest(
            @NotBlank @Size(max = 128) String idempotencyKey,
            @NotBlank @Size(max = 32) String businessScene,
            @NotBlank @Size(max = 128) String paymentSceneCode,
            @NotBlank @Size(max = 128) String paymentMethodCode,
            @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 18, fraction = 6)
            BigDecimal amount,
            @Digits(integer = 18, fraction = 6) BigDecimal roundingAdjustment,
            @Size(max = 128) String correlationId,
            @Size(max = 128) String terminalCode,
            Instant expiresAt,
            @io.swagger.v3.oas.annotations.media.Schema(accessMode = io.swagger.v3.oas.annotations.media.Schema.AccessMode.WRITE_ONLY,
                    description = "患者付款码，仅用于当次渠道请求，不持久化")
            @Size(max = 32) String authorizationCode) {
        @Override public String toString() { return "PaymentOrderRequest[authorizationCode=REDACTED]"; }
    }
    record RefundRequest(
            @NotBlank @Size(max = 64) String refundNo,
            @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 18, fraction = 6)
            BigDecimal amount,
            Instant refundedAt, @Size(max = 128) String externalTransactionNo,
            @NotBlank @Size(max = 1000) String reason) {}
    record RefundOrderRequest(
            @NotBlank @Size(max = 128) String idempotencyKey,
            @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 18, fraction = 6)
            BigDecimal amount,
            @NotBlank @Size(max = 1000) String reason,
            @Size(max = 128) String correlationId,
            @Size(max = 128) String terminalCode) {}
    record DirectRefundRequest(
            @NotBlank @Size(max = 128) String idempotencyKey,
            @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 18, fraction = 6)
            BigDecimal refundAmount,
            @NotBlank @Size(max = 1000) String reason,
            @Size(max = 128) String correlationId,
            @Size(max = 128) String terminalCode,
            List<Long> chargeItemIds) {}
    record PaymentRecoveryRequest(@NotBlank @Size(max = 128) String batchCode,
                                  @NotNull @jakarta.validation.constraints.Min(1)
                                  @jakarta.validation.constraints.Max(100) Integer limit) {}
}
