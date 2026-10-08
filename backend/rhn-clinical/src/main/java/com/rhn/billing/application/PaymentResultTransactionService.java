package com.rhn.billing.application;

import com.rhn.billing.api.PaymentResultDirectory.PaymentOrderView;
import com.rhn.billing.api.PaymentResultDirectory.VerifiedPaymentResult;
import com.rhn.billing.domain.PaymentOrder;
import com.rhn.platform.integration.api.ExternalMessageService;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;

/** Applies verified channel facts atomically, without calling a remote channel inside the transaction. */
@Service
class PaymentResultTransactionService {
    private final PaymentOrderTransactionService transactions;
    private final BillingApplicationService billing;
    private final ExternalMessageService messages;
    private final ExecutionContextProvider contexts;

    PaymentResultTransactionService(PaymentOrderTransactionService transactions, BillingApplicationService billing,
                                    ExternalMessageService messages, ExecutionContextProvider contexts) {
        this.transactions = transactions; this.billing = billing; this.messages = messages; this.contexts = contexts;
    }

    @Transactional
    PaymentOrderView accept(VerifiedPaymentResult input) {
        if (input == null || input.status() == null) throw badRequest("PAYMENT_CALLBACK_RESULT_REQUIRED", "支付回调结果及状态不能为空");
        String command = required(input.commandCode(), "PAYMENT_EVENT_COMMAND_REQUIRED", "支付事件命令编码不能为空");
        String messageId = required(input.externalMessageBusinessId(), "PAYMENT_CALLBACK_MESSAGE_REQUIRED", "支付回调必须提供外部业务消息号");
        PaymentOrder order = transactions.lockByOrderNo(input.paymentOrderNo());
        if (!order.paymentMethodCode().equals(upper(input.paymentMethodCode()))) {
            throw conflict("PAYMENT_CALLBACK_METHOD_MISMATCH", "支付回调方式与原支付指令不一致");
        }
        boolean success = input.status() == VerifiedPaymentResult.ResultStatus.SUCCEEDED;
        String currency = upper(input.currencyCode());
        if (success && currency == null) throw badRequest("PAYMENT_CALLBACK_CURRENCY_REQUIRED", "成功支付回调必须明确返回币种");
        if (currency != null && !currency.equals(order.currencyCode())) {
            throw conflict("PAYMENT_CALLBACK_CURRENCY_MISMATCH", "支付回调币种与原支付指令不一致");
        }
        BigDecimal amount = reportedAmount(input.capturedAmount());
        if (success) {
            requireSuccess(order, amount, input.externalOrderNo(), input.externalTransactionNo());
            if (Strings.trimToNull(input.errorCode()) != null) throw conflict("PAYMENT_CALLBACK_RESULT_CONFLICT", "成功支付回调不能同时携带错误码");
        }
        var context = contexts.requireCurrent();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("paymentOrderId", order.id()); payload.put("paymentOrderNo", order.orderNo());
        payload.put("orderType", order.orderType()); payload.put("paymentMethodCode", order.paymentMethodCode());
        payload.put("status", input.status().name()); payload.put("capturedAmount", amount);
        payload.put("currencyCode", currency); payload.put("externalOrderNo", Strings.trimToNull(input.externalOrderNo()));
        payload.put("externalTransactionNo", Strings.trimToNull(input.externalTransactionNo()));
        payload.put("errorCode", Strings.trimToNull(input.errorCode())); payload.put("errorMessage", Strings.trimToNull(input.errorMessage()));
        payload.put("sanitizedPayload", input.sanitizedPayload());
        var inbound = messages.receiveInbound(new ExternalMessageService.InboundMessage(
                "PAYMENT_" + order.paymentMethodCode(), "PAYMENT_RESULT", messageId, order.correlationId(),
                context.organizationId(), context.departmentId(), payload));
        PaymentOrderView before = transactions.view(order.id(), false);
        if ("PROCESSED".equals(inbound.status())) {
            if (!"PaymentOrder".equals(inbound.relatedResourceType()) || !Objects.equals(order.id(), inbound.relatedResourceId())
                    || inbound.relatedResourceVersion() == null || inbound.relatedResourceVersion() > before.revision()
                    || before.events().stream().noneMatch(event -> Objects.equals(event.externalMessageId(), inbound.id()))) {
                throw conflict("PAYMENT_PROCESSED_RESULT_MISSING", "已处理支付消息缺少对应支付事件或正确关联，需核实原结果");
            }
            return transactions.view(order.id(), true);
        }
        if (before.events().stream().anyMatch(event -> command.equals(event.commandCode())
                || Objects.equals(event.externalMessageId(), inbound.id()))) {
            throw conflict("PAYMENT_CALLBACK_COMMAND_REUSED", "支付回调命令已使用或存在未完成消息处理的历史事件，需核实原结果");
        }
        if (success) {
            if ("REFUND".equals(order.orderType())) completeRefund(order.id(), "外部通道退款", command, inbound.id(),
                    input.externalOrderNo(), input.externalTransactionNo(), amount);
            else completePayment(order.id(), command, inbound.id(), input.externalOrderNo(), input.externalTransactionNo(), amount);
        } else if ("REFUND".equals(order.orderType())) {
            transactions.transitionRefund(order.id(), new PaymentOrderTransactionService.RefundTransitionCommand(
                    "REFUND_CALLBACK", input.status().name(), command, inbound.id(), input.externalOrderNo(),
                    input.externalTransactionNo(), amount, order.refundedAmount(), input.errorCode(), input.errorMessage()));
        } else {
            transactions.transition(order.id(), new PaymentOrderTransactionService.TransitionCommand(
                    input.status() == VerifiedPaymentResult.ResultStatus.PENDING ? "CALLBACK" : "FAIL", input.status().name(),
                    command, inbound.id(), input.externalOrderNo(), input.externalTransactionNo(), amount,
                    order.capturedAmount(), input.errorCode(), input.errorMessage()));
        }
        transactions.flush();
        PaymentOrderView view = transactions.view(order.id(), inbound.duplicate());
        messages.markProcessed(inbound.id(), "PaymentOrder", order.id(), view.revision());
        return view;
    }

    @Transactional
    void completePayment(Long orderId, String command, Long messageId, String externalOrderNo,
                         String transactionNo, BigDecimal amount) {
        PaymentOrder order = transactions.lock(orderId);
        if (!"SETTLEMENT_PAY".equals(order.orderType())) throw conflict("PAYMENT_ORDER_TYPE_INVALID", "当前指令不是收款指令");
        BigDecimal confirmed = requireSuccess(order, amount, externalOrderNo, transactionNo);
        transactions.transition(order.id(), new PaymentOrderTransactionService.TransitionCommand(
                "CAPTURE", "SUCCEEDED", command, messageId, externalOrderNo, transactionNo, confirmed, confirmed, null, null));
        billing.collectPayment(order.invoiceId(), new BillingApplicationService.PaymentCommand(
                "PAY-" + order.orderNo(), order.paymentMethodCode(), order.paymentSceneCode(), confirmed,
                Instant.now(), transactionNo, "统一支付指令 " + order.orderNo(), order.id()));
    }

    @Transactional
    void completeRefund(Long orderId, String reason, String command, Long messageId, String externalOrderNo,
                        String transactionNo, BigDecimal amount) {
        PaymentOrder order = transactions.lock(orderId);
        if (!"REFUND".equals(order.orderType())) throw conflict("REFUND_ORDER_TYPE_INVALID", "当前指令不是退款指令");
        BigDecimal confirmed = requireSuccess(order, amount, externalOrderNo, transactionNo);
        var original = transactions.requireOriginalPayment(order);
        transactions.transitionRefund(order.id(), new PaymentOrderTransactionService.RefundTransitionCommand(
                "REFUND_CALLBACK", "REFUNDED", command, messageId, externalOrderNo, transactionNo, confirmed, confirmed, null, null));
        billing.refundPayment(original.id(), new BillingApplicationService.RefundCommand(
                "RF-" + order.orderNo(), confirmed, Instant.now(), transactionNo, reason, order.id(), order.paymentSceneCode()));
    }

    private BigDecimal requireSuccess(PaymentOrder order, BigDecimal value, String externalOrderNo, String transactionNo) {
        BigDecimal amount = reportedAmount(value);
        if (amount == null) throw badRequest("PAYMENT_RESULT_AMOUNT_REQUIRED", "成功支付或退款回执必须明确返回金额");
        if (amount.signum() <= 0 || amount.compareTo(order.requestedAmount()) != 0) {
            throw conflict("PAYMENT_RESULT_AMOUNT_MISMATCH", "成功回执金额必须与支付或退款申请金额一致");
        }
        String external = required(externalOrderNo, "PAYMENT_RESULT_ORDER_REQUIRED", "成功回执必须提供外部订单号");
        required(transactionNo, "PAYMENT_RESULT_TRANSACTION_REQUIRED", "成功回执必须提供交易流水号");
        if (("SUCCEEDED".equals(order.status()) || "REFUNDED".equals(order.status()))
                && !Objects.equals(order.externalOrderNo(), external)) {
            throw conflict("PAYMENT_RESULT_ORDER_MISMATCH", "重复成功回执的外部订单号与原结果不一致");
        }
        return amount;
    }

    private BigDecimal reportedAmount(BigDecimal value) {
        if (value == null) return null;
        if (value.signum() < 0) throw badRequest("PAYMENT_RESULT_AMOUNT_INVALID", "支付回执金额不能为负数");
        try { return value.setScale(6, RoundingMode.UNNECESSARY); }
        catch (ArithmeticException exception) { throw badRequest("PAYMENT_RESULT_AMOUNT_PRECISION_INVALID", "支付回执金额超出六位小数精度，不能自动舍入"); }
    }
    private String required(String value, String code, String message) {
        String text = Strings.trimToNull(value); if (text == null) throw badRequest(code, message); return text;
    }
    private String upper(String value) { String text = Strings.trimToNull(value); return text == null ? null : text.toUpperCase(Locale.ROOT); }
}
