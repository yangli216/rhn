package com.rhn.billing.application;

import com.rhn.billing.api.PaymentChannelAdapter;
import com.rhn.billing.api.BillingSceneCompletionHandler;
import com.rhn.billing.api.PaymentChannelAdapter.InitiationResult;
import com.rhn.billing.api.PaymentChannelAdapter.PaymentInstruction;
import com.rhn.billing.api.PaymentChannelAdapter.RefundInstruction;
import com.rhn.billing.api.PaymentChannelAdapter.RefundResult;
import com.rhn.billing.api.PaymentChannelAdapter.QueryInstruction;
import com.rhn.billing.api.PaymentChannelAdapter.QueryResult;
import com.rhn.billing.api.PaymentResultDirectory;
import com.rhn.billing.api.PaymentResultDirectory.PaymentOrderView;
import com.rhn.billing.domain.PaymentOrder;
import com.rhn.billing.domain.Payment;
import com.rhn.platform.integration.api.ExternalMessageService;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
public class PaymentOrchestrationService implements PaymentResultDirectory {
    private static final Logger log = LoggerFactory.getLogger(PaymentOrchestrationService.class);
    private final PaymentOrderTransactionService transactions;
    private final BillingApplicationService billing;
    private final ExternalMessageService messages;
    private final ExecutionContextProvider contextProvider;
    private final List<PaymentChannelAdapter> adapters;
    private final List<BillingSceneCompletionHandler> completionHandlers;

    public PaymentOrchestrationService(PaymentOrderTransactionService transactions,
                                       BillingApplicationService billing,
                                       ExternalMessageService messages,
                                       ExecutionContextProvider contextProvider,
                                       List<PaymentChannelAdapter> adapters,
                                       List<BillingSceneCompletionHandler> completionHandlers) {
        this.transactions = transactions; this.billing = billing; this.messages = messages;
        this.contextProvider = contextProvider; this.adapters = List.copyOf(adapters);
        this.completionHandlers = List.copyOf(completionHandlers);
    }

    public PaymentOrderView create(CreatePaymentOrderCommand input) {
        var created = transactions.create(new PaymentOrderTransactionService.CreateCommand(
                input.settlementId(), input.idempotencyKey(), input.businessScene(), input.paymentSceneCode(),
                input.paymentMethodCode(), input.amount(), input.roundingAdjustment(), input.correlationId(), input.terminalCode(), input.expiresAt()));
        PaymentOrder order = created.order();
        notifyPaymentRequested(order);
        if (created.duplicate() || terminal(order.status())) {
            if ("SUCCEEDED".equals(order.status()) && "SETTLEMENT_PAY".equals(order.orderType())) completeBusiness(order);
            return transactions.view(order.id(), created.duplicate());
        }

        PaymentInstruction instruction = instruction(order);
        PaymentChannelAdapter adapter = adapters.stream().filter(value -> value.supports(order.paymentMethodCode()))
                .findFirst().orElse(null);
        if (adapter == null) return queueForExternalAdapter(order, instruction);

        transactions.transition(order.id(), new PaymentOrderTransactionService.TransitionCommand(
                "SUBMIT", "PROCESSING", "SUBMIT-" + order.orderNo(), null,
                null, null, null, null, null, null));
        InitiationResult result;
        try {
            result = adapter.initiate(instruction);
        } catch (RuntimeException exception) {
            transactions.transition(order.id(), new PaymentOrderTransactionService.TransitionCommand(
                    "QUERY", "PENDING", "UNCERTAIN-" + order.orderNo(), null,
                    null, null, null, null, "PAYMENT_CHANNEL_UNCERTAIN",
                    message(exception)));
            return transactions.view(order.id(), false);
        }
        applyInitiationResult(order, result);
        return transactions.view(order.id(), false);
    }

    public PaymentOrderView refund(CreateRefundOrderCommand input) {
        var created = transactions.createRefund(new PaymentOrderTransactionService.CreateRefundCommand(
                input.originalPaymentId(), input.idempotencyKey(), input.amount(), input.reason(),
                input.correlationId(), input.terminalCode()));
        PaymentOrder order = created.order();
        if (created.duplicate() || terminal(order.status())) return transactions.view(order.id(), created.duplicate());
        Payment original = transactions.requireOriginalPayment(order);
        RefundInstruction instruction = refundInstruction(order, original, input.reason());
        PaymentChannelAdapter adapter = adapters.stream().filter(value -> value.supports(order.paymentMethodCode()))
                .findFirst().orElse(null);
        if (adapter == null) return queueRefundForExternalAdapter(order, instruction);
        transactions.transitionRefund(order.id(), new PaymentOrderTransactionService.RefundTransitionCommand(
                "REFUND_REQUEST", "REFUNDING", "SUBMIT-" + order.orderNo(), null,
                null, null, null, null, null, null));
        RefundResult result;
        try {
            result = adapter.refund(instruction);
        } catch (RuntimeException exception) {
            transactions.transitionRefund(order.id(), new PaymentOrderTransactionService.RefundTransitionCommand(
                    "QUERY", "PENDING", "UNCERTAIN-" + order.orderNo(), null,
                    null, null, null, null, "REFUND_CHANNEL_UNCERTAIN", message(exception)));
            return transactions.view(order.id(), false);
        }
        applyRefundResult(order, original, input.reason(), result);
        return transactions.view(order.id(), false);
    }

    public PaymentOrderView get(Long orderId) {
        return transactions.view(orderId, false);
    }

    public PaymentOrderView retryBusinessCompletion(Long orderId) {
        PaymentOrder order = transactions.require(orderId);
        if (!"SETTLEMENT_PAY".equals(order.orderType()) || !"SUCCEEDED".equals(order.status())) {
            throw conflict("PAYMENT_ORDER_NOT_COMPLETABLE", "只有支付成功的正向支付指令可以重试业务完成");
        }
        completeBusiness(order);
        return transactions.view(order.id(), false);
    }

    public List<PaymentOrderView> listByAccount(Long accountId) {
        return transactions.listByAccount(accountId);
    }

    public List<PaymentOrderView> recoveryWorklist(int limit) {
        return transactions.recoveryWorklist(limit);
    }

    public PaymentOrderView query(Long orderId) {
        PaymentOrder order = transactions.require(orderId);
        if (terminal(order.status())) return transactions.view(order.id(), false);
        String queryCode = "QUERY-" + GlobalIds.external(GlobalIds.next());
        QueryInstruction instruction = queryInstruction(order);
        PaymentChannelAdapter adapter = adapters.stream().filter(value -> value.supports(order.paymentMethodCode()))
                .findFirst().orElse(null);
        if (adapter == null) return queueQueryForExternalAdapter(order, instruction, queryCode);

        markQueryStarted(order, queryCode);
        QueryResult result;
        try {
            result = adapter.query(instruction);
        } catch (RuntimeException exception) {
            markQueryUncertain(order, queryCode, message(exception));
            return transactions.view(order.id(), false);
        }
        applyQueryResult(order.id(), queryCode, result);
        return transactions.view(order.id(), false);
    }

    public PaymentOrderView cancel(Long orderId) {
        PaymentOrder order = transactions.require(orderId);
        if (terminal(order.status())) return transactions.view(order.id(), false);
        transactions.transition(order.id(), new PaymentOrderTransactionService.TransitionCommand(
                "CANCEL", "CANCELLED", "CANCEL-" + order.orderNo(), null,
                order.externalOrderNo(), null, null, order.capturedAmount(),
                "OPERATOR_CANCELLED", "收银员主动取消支付订单"));
        return transactions.view(order.id(), false);
    }

    public List<RecoveryResult> recoverPending(String batchCode, int limit) {
        String batch = batchCode == null || batchCode.isBlank() ? "PAYMENT-RECOVERY" : batchCode.trim();
        return transactions.recoveryWorklist(limit).stream().map(item -> {
            try {
                PaymentOrderView result = query(item.id());
                return new RecoveryResult(batch, item.id(), result.status(), true, null);
            } catch (RuntimeException exception) {
                return new RecoveryResult(batch, item.id(), item.status(), false, message(exception));
            }
        }).toList();
    }

    @Override
    public PaymentOrderView accept(VerifiedPaymentResult result) {
        PaymentOrder order = transactions.requireByOrderNo(result.paymentOrderNo());
        if (!order.paymentMethodCode().equals(normalize(result.paymentMethodCode()))) {
            throw conflict("PAYMENT_CALLBACK_METHOD_MISMATCH", "支付回调方式与原支付指令不一致");
        }
        ExecutionContext context = contextProvider.requireCurrent();
        var inbound = messages.receiveInbound(new ExternalMessageService.InboundMessage(
                endpoint(order.paymentMethodCode()), "PAYMENT_RESULT", result.externalMessageBusinessId(),
                order.correlationId(), context.organizationId(), context.departmentId(), result.sanitizedPayload()));
        if ("REFUND".equals(order.orderType())) acceptRefundResult(order, result, inbound.id());
        else acceptPaymentResult(order, result, inbound.id());
        PaymentOrderView view = transactions.view(order.id(), inbound.duplicate());
        messages.markProcessed(inbound.id(), "PaymentOrder", order.id(), view.revision());
        return view;
    }

    private void acceptPaymentResult(PaymentOrder order, VerifiedPaymentResult result, Long inboundId) {
        switch (result.status()) {
            case SUCCEEDED -> complete(order, result.commandCode(), inboundId, result.externalOrderNo(),
                    result.externalTransactionNo(), result.capturedAmount());
            case PENDING -> transactions.transition(order.id(), new PaymentOrderTransactionService.TransitionCommand(
                    "CALLBACK", "PENDING", result.commandCode(), inboundId, result.externalOrderNo(),
                    result.externalTransactionNo(), result.capturedAmount(), order.capturedAmount(),
                    result.errorCode(), result.errorMessage()));
            case FAILED -> transactions.transition(order.id(), new PaymentOrderTransactionService.TransitionCommand(
                    "FAIL", "FAILED", result.commandCode(), inboundId, result.externalOrderNo(),
                    result.externalTransactionNo(), result.capturedAmount(), order.capturedAmount(),
                    result.errorCode(), result.errorMessage()));
        }
    }

    private void acceptRefundResult(PaymentOrder order, VerifiedPaymentResult result, Long inboundId) {
        Payment original = transactions.requireOriginalPayment(order);
        switch (result.status()) {
            case SUCCEEDED -> completeRefund(order, original, "外部通道退款", result.commandCode(), inboundId,
                    result.externalOrderNo(), result.externalTransactionNo(), result.capturedAmount());
            case PENDING -> transactions.transitionRefund(order.id(), new PaymentOrderTransactionService.RefundTransitionCommand(
                    "REFUND_CALLBACK", "PENDING", result.commandCode(), inboundId, result.externalOrderNo(),
                    result.externalTransactionNo(), result.capturedAmount(), order.refundedAmount(),
                    result.errorCode(), result.errorMessage()));
            case FAILED -> transactions.transitionRefund(order.id(), new PaymentOrderTransactionService.RefundTransitionCommand(
                    "REFUND_CALLBACK", "FAILED", result.commandCode(), inboundId, result.externalOrderNo(),
                    result.externalTransactionNo(), result.capturedAmount(), order.refundedAmount(),
                    result.errorCode(), result.errorMessage()));
        }
    }

    private PaymentOrderView queueForExternalAdapter(PaymentOrder order, PaymentInstruction instruction) {
        ExecutionContext context = contextProvider.requireCurrent();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("paymentOrderId", instruction.paymentOrderId());
        payload.put("orderNo", instruction.orderNo());
        payload.put("idempotencyKey", instruction.idempotencyKey());
        payload.put("settlementId", instruction.settlementId());
        payload.put("businessScene", instruction.businessScene());
        payload.put("paymentSceneCode", instruction.paymentSceneCode());
        payload.put("paymentMethodCode", instruction.paymentMethodCode());
        payload.put("amount", instruction.amount());
        payload.put("currencyCode", instruction.currencyCode());
        payload.put("correlationId", instruction.correlationId());
        if (instruction.terminalCode() != null) payload.put("terminalCode", instruction.terminalCode());
        if (instruction.expiresAt() != null) payload.put("expiresAt", instruction.expiresAt());
        var outbound = messages.enqueueOutbound(new ExternalMessageService.OutboundMessage(
                endpoint(order.paymentMethodCode()), "PAYMENT_ORDER", order.orderNo(), order.correlationId(),
                context.organizationId(), context.departmentId(), payload,
                "PaymentOrder", order.id(), order.revision()));
        transactions.transition(order.id(), new PaymentOrderTransactionService.TransitionCommand(
                "SUBMIT", "PENDING", "SUBMIT-" + order.orderNo(), outbound.id(),
                null, null, null, null, null, null));
        return transactions.view(order.id(), false);
    }

    private PaymentOrderView queueRefundForExternalAdapter(PaymentOrder order, RefundInstruction instruction) {
        ExecutionContext context = contextProvider.requireCurrent();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("paymentOrderId", instruction.paymentOrderId());
        payload.put("orderNo", instruction.orderNo());
        payload.put("idempotencyKey", instruction.idempotencyKey());
        payload.put("originalPaymentId", instruction.originalPaymentId());
        payload.put("originalPaymentNo", instruction.originalPaymentNo());
        if (instruction.originalExternalTransactionNo() != null) {
            payload.put("originalExternalTransactionNo", instruction.originalExternalTransactionNo());
        }
        payload.put("paymentMethodCode", instruction.paymentMethodCode());
        payload.put("amount", instruction.amount());
        payload.put("currencyCode", instruction.currencyCode());
        payload.put("reason", instruction.reason());
        payload.put("correlationId", instruction.correlationId());
        if (instruction.terminalCode() != null) payload.put("terminalCode", instruction.terminalCode());
        var outbound = messages.enqueueOutbound(new ExternalMessageService.OutboundMessage(
                endpoint(order.paymentMethodCode()), "PAYMENT_REFUND", order.orderNo(), order.correlationId(),
                context.organizationId(), context.departmentId(), payload,
                "PaymentOrder", order.id(), order.revision()));
        transactions.transitionRefund(order.id(), new PaymentOrderTransactionService.RefundTransitionCommand(
                "REFUND_REQUEST", "PENDING", "SUBMIT-" + order.orderNo(), outbound.id(),
                null, null, null, null, null, null));
        return transactions.view(order.id(), false);
    }

    private PaymentOrderView queueQueryForExternalAdapter(PaymentOrder order, QueryInstruction instruction,
                                                           String queryCode) {
        ExecutionContext context = contextProvider.requireCurrent();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("paymentOrderId", instruction.paymentOrderId());
        payload.put("orderNo", instruction.orderNo());
        payload.put("orderType", instruction.orderType());
        payload.put("paymentMethodCode", instruction.paymentMethodCode());
        if (instruction.externalOrderNo() != null) payload.put("externalOrderNo", instruction.externalOrderNo());
        payload.put("expectedAmount", instruction.expectedAmount());
        payload.put("currencyCode", instruction.currencyCode());
        payload.put("correlationId", instruction.correlationId());
        if (instruction.terminalCode() != null) payload.put("terminalCode", instruction.terminalCode());
        var outbound = messages.enqueueOutbound(new ExternalMessageService.OutboundMessage(
                endpoint(order.paymentMethodCode()), "PAYMENT_QUERY", queryCode, order.correlationId(),
                context.organizationId(), context.departmentId(), payload,
                "PaymentOrder", order.id(), order.revision()));
        transitionQueryPending(order, "QUERY", queryCode, outbound.id(), null, null);
        return transactions.view(order.id(), false);
    }

    private void markQueryStarted(PaymentOrder order, String queryCode) {
        transitionQueryPending(order, "QUERY", queryCode + "-START", null, null, null);
    }

    private void markQueryUncertain(PaymentOrder order, String queryCode, String errorMessage) {
        transitionQueryPending(order, "QUERY", queryCode + "-UNCERTAIN", null,
                "PAYMENT_QUERY_UNCERTAIN", errorMessage);
    }

    private void transitionQueryPending(PaymentOrder order, String eventType, String commandCode,
                                        Long externalMessageId, String errorCode, String errorMessage) {
        if ("REFUND".equals(order.orderType())) {
            transactions.transitionRefund(order.id(), new PaymentOrderTransactionService.RefundTransitionCommand(
                    eventType, "PENDING", commandCode, externalMessageId, order.externalOrderNo(),
                    null, null, order.refundedAmount(), errorCode, errorMessage));
        } else {
            transactions.transition(order.id(), new PaymentOrderTransactionService.TransitionCommand(
                    eventType, "PENDING", commandCode, externalMessageId, order.externalOrderNo(),
                    null, null, order.capturedAmount(), errorCode, errorMessage));
        }
    }

    private void applyQueryResult(Long orderId, String queryCode, QueryResult result) {
        PaymentOrder order = transactions.require(orderId);
        if (terminal(order.status())) return;
        String commandCode = queryCode + "-RESULT";
        if ("REFUND".equals(order.orderType())) {
            Payment original = transactions.requireOriginalPayment(order);
            switch (result.outcome()) {
                case SUCCEEDED -> completeRefund(order, original, "支付通道主动查询恢复", commandCode, null,
                        result.externalOrderNo(), result.externalTransactionNo(), result.completedAmount());
                case PENDING -> transitionQueryPending(order, "QUERY", commandCode, null,
                        result.errorCode(), result.errorMessage());
                case FAILED, CANCELLED, EXPIRED -> transactions.transitionRefund(order.id(),
                        new PaymentOrderTransactionService.RefundTransitionCommand("QUERY", "FAILED", commandCode,
                                null, result.externalOrderNo(), result.externalTransactionNo(),
                                result.completedAmount(), order.refundedAmount(), result.errorCode(), result.errorMessage()));
            }
        } else {
            switch (result.outcome()) {
                case SUCCEEDED -> complete(order, commandCode, null, result.externalOrderNo(),
                        result.externalTransactionNo(), result.completedAmount());
                case PENDING -> transitionQueryPending(order, "QUERY", commandCode, null,
                        result.errorCode(), result.errorMessage());
                case FAILED -> transactions.transition(order.id(), new PaymentOrderTransactionService.TransitionCommand(
                        "QUERY", "FAILED", commandCode, null, result.externalOrderNo(), result.externalTransactionNo(),
                        result.completedAmount(), order.capturedAmount(), result.errorCode(), result.errorMessage()));
                case CANCELLED -> transactions.transition(order.id(), new PaymentOrderTransactionService.TransitionCommand(
                        "QUERY", "CANCELLED", commandCode, null, result.externalOrderNo(), result.externalTransactionNo(),
                        result.completedAmount(), order.capturedAmount(), result.errorCode(), result.errorMessage()));
                case EXPIRED -> transactions.transition(order.id(), new PaymentOrderTransactionService.TransitionCommand(
                        "QUERY", "EXPIRED", commandCode, null, result.externalOrderNo(), result.externalTransactionNo(),
                        result.completedAmount(), order.capturedAmount(), result.errorCode(), result.errorMessage()));
            }
        }
    }

    private void applyInitiationResult(PaymentOrder order, InitiationResult result) {
        switch (result.outcome()) {
            case SUCCEEDED -> complete(order, "CAPTURE-" + order.orderNo(), null, result.externalOrderNo(),
                    result.externalTransactionNo(), result.capturedAmount());
            case PENDING -> transactions.transition(order.id(), new PaymentOrderTransactionService.TransitionCommand(
                    "SUBMIT", "PENDING", "PENDING-" + order.orderNo(), null, result.externalOrderNo(),
                    result.externalTransactionNo(), null, order.capturedAmount(), null, null));
            case FAILED -> transactions.transition(order.id(), new PaymentOrderTransactionService.TransitionCommand(
                    "FAIL", "FAILED", "FAIL-" + order.orderNo(), null, result.externalOrderNo(),
                    result.externalTransactionNo(), null, order.capturedAmount(), result.errorCode(), result.errorMessage()));
        }
    }

    private void applyRefundResult(PaymentOrder order, Payment original, String reason, RefundResult result) {
        switch (result.outcome()) {
            case SUCCEEDED -> completeRefund(order, original, reason, "REFUND-" + order.orderNo(), null,
                    result.externalOrderNo(), result.externalTransactionNo(), result.refundedAmount());
            case PENDING -> transactions.transitionRefund(order.id(), new PaymentOrderTransactionService.RefundTransitionCommand(
                    "REFUND_REQUEST", "PENDING", "PENDING-" + order.orderNo(), null, result.externalOrderNo(),
                    result.externalTransactionNo(), null, order.refundedAmount(), null, null));
            case FAILED -> transactions.transitionRefund(order.id(), new PaymentOrderTransactionService.RefundTransitionCommand(
                    "REFUND_CALLBACK", "FAILED", "FAIL-" + order.orderNo(), null, result.externalOrderNo(),
                    result.externalTransactionNo(), null, order.refundedAmount(), result.errorCode(), result.errorMessage()));
        }
    }

    private void complete(PaymentOrder order, String commandCode, Long externalMessageId, String externalOrderNo,
                          String externalTransactionNo, BigDecimal capturedAmount) {
        BigDecimal amount = capturedAmount == null ? order.requestedAmount() : capturedAmount;
        billing.collectPayment(order.invoiceId(), new BillingApplicationService.PaymentCommand(
                "PAY-" + order.orderNo(), order.paymentMethodCode(), order.paymentSceneCode(), amount,
                Instant.now(), externalTransactionNo, "统一支付指令 " + order.orderNo(), order.id()));
        transactions.transition(order.id(), new PaymentOrderTransactionService.TransitionCommand(
                "CAPTURE", "SUCCEEDED", commandCode, externalMessageId, externalOrderNo,
                externalTransactionNo, amount, amount, null, null));
        completeBusiness(order);
    }

    private void completeBusiness(PaymentOrder order) {
        BillingSceneCompletionHandler handler = completionHandlers.stream()
                .filter(value -> value.supports(order.businessScene())).findFirst().orElse(null);
        if (handler == null) return;
        try {
            handler.complete(new BillingSceneCompletionHandler.PaymentCompletion(order.id(), order.invoiceId(),
                    order.patientAccountId(), order.businessScene(), "BUSINESS-" + order.orderNo()));
        } catch (RuntimeException exception) {
            log.error("Payment {} succeeded but {} business completion failed", order.orderNo(),
                    order.businessScene(), exception);
        }
    }

    private void notifyPaymentRequested(PaymentOrder order) {
        BillingSceneCompletionHandler handler = completionHandlers.stream()
                .filter(value -> value.supports(order.businessScene())).findFirst().orElse(null);
        if (handler == null) return;
        try {
            handler.paymentRequested(new BillingSceneCompletionHandler.PaymentRequested(order.id(), order.invoiceId(),
                    order.patientAccountId(), order.businessScene(), "PAYMENT-REQUEST-" + order.orderNo()));
        } catch (RuntimeException exception) {
            log.error("Payment {} created but {} scene linkage failed", order.orderNo(), order.businessScene(), exception);
        }
    }

    private void completeRefund(PaymentOrder order, Payment original, String reason, String commandCode,
                                Long externalMessageId, String externalOrderNo,
                                String externalTransactionNo, BigDecimal refundedAmount) {
        BigDecimal amount = refundedAmount == null ? order.requestedAmount() : refundedAmount;
        billing.refundPayment(original.id(), new BillingApplicationService.RefundCommand(
                "RF-" + order.orderNo(), amount, Instant.now(), externalTransactionNo, reason,
                order.id(), order.paymentSceneCode()));
        transactions.transitionRefund(order.id(), new PaymentOrderTransactionService.RefundTransitionCommand(
                "REFUND_CALLBACK", "REFUNDED", commandCode, externalMessageId, externalOrderNo,
                externalTransactionNo, amount, amount, null, null));
    }

    private PaymentInstruction instruction(PaymentOrder order) {
        return new PaymentInstruction(order.id(), order.orderNo(), order.idempotencyKey(), order.patientAccountId(),
                order.invoiceId(), order.businessScene(), order.paymentSceneCode(), order.paymentMethodCode(),
                order.requestedAmount(), order.currencyCode(), order.correlationId(), order.terminalCode(), order.expiresAt());
    }

    private RefundInstruction refundInstruction(PaymentOrder order, Payment original, String reason) {
        return new RefundInstruction(order.id(), order.orderNo(), order.idempotencyKey(), original.id(),
                original.paymentNo(), original.externalTransactionNo(), order.businessScene(),
                order.paymentSceneCode(), order.paymentMethodCode(), order.requestedAmount(),
                order.currencyCode(), reason, order.correlationId(), order.terminalCode());
    }

    private QueryInstruction queryInstruction(PaymentOrder order) {
        return new QueryInstruction(order.id(), order.orderNo(), order.orderType(), order.paymentMethodCode(),
                order.externalOrderNo(), order.requestedAmount(), order.currencyCode(), order.correlationId(),
                order.terminalCode());
    }

    private boolean terminal(String status) {
        return List.of("SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED", "REFUNDED").contains(status);
    }
    private String endpoint(String method) { return "PAYMENT_" + method; }
    private String normalize(String value) { return value == null ? null : value.trim().toUpperCase(); }
    private String message(RuntimeException exception) {
        String value = exception.getMessage(); return value == null || value.isBlank() ? "支付通道状态暂时未知" : value;
    }

    public record CreatePaymentOrderCommand(
            Long settlementId, String idempotencyKey, String businessScene, String paymentSceneCode,
            String paymentMethodCode, BigDecimal amount, BigDecimal roundingAdjustment,
            String correlationId, String terminalCode,
            Instant expiresAt) {
        public CreatePaymentOrderCommand(
                Long settlementId, String idempotencyKey, String businessScene, String paymentSceneCode,
                String paymentMethodCode, BigDecimal amount, String correlationId, String terminalCode,
                Instant expiresAt) {
            this(settlementId, idempotencyKey, businessScene, paymentSceneCode,
                    paymentMethodCode, amount, null, correlationId, terminalCode, expiresAt);
        }
    }
    public record CreateRefundOrderCommand(
            Long originalPaymentId, String idempotencyKey, BigDecimal amount, String reason,
            String correlationId, String terminalCode) {}
    public record RecoveryResult(String batchCode, Long paymentOrderId, String status,
                                 boolean accepted, String errorMessage) {}
}
