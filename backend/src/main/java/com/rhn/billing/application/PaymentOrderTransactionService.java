package com.rhn.billing.application;

import com.rhn.billing.api.PaymentResultDirectory.PaymentEventView;
import com.rhn.billing.api.PaymentResultDirectory.PaymentOrderView;
import com.rhn.billing.domain.Invoice;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.PaymentEvent;
import com.rhn.billing.domain.PaymentOrder;
import com.rhn.billing.domain.Payment;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.infrastructure.InvoiceRepository;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.PaymentEventRepository;
import com.rhn.billing.infrastructure.PaymentOrderRepository;
import com.rhn.billing.infrastructure.PaymentRepository;
import com.rhn.platform.dictionary.api.DictionaryAttributeDirectory;
import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class PaymentOrderTransactionService {
    private static final DateTimeFormatter NUMBER_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneOffset.UTC);
    private final PaymentOrderRepository orderRepository;
    private final PaymentEventRepository eventRepository;
    private final PatientAccountRepository accountRepository;
    private final InvoiceRepository invoiceRepository;
    private final PaymentRepository paymentRepository;
    private final LedgerEntryRepository ledgerRepository;
    private final DictionaryDirectory dictionaryDirectory;
    private final DictionaryAttributeDirectory attributeDirectory;
    private final ExecutionContextProvider contextProvider;
    private final SettlementApplicationService settlements;

    PaymentOrderTransactionService(PaymentOrderRepository orderRepository,
                                   PaymentEventRepository eventRepository,
                                   PatientAccountRepository accountRepository,
                                   InvoiceRepository invoiceRepository,
                                   PaymentRepository paymentRepository,
                                   LedgerEntryRepository ledgerRepository,
                                   DictionaryDirectory dictionaryDirectory,
                                   DictionaryAttributeDirectory attributeDirectory,
                                   ExecutionContextProvider contextProvider,
                                   SettlementApplicationService settlements) {
        this.orderRepository = orderRepository; this.eventRepository = eventRepository;
        this.accountRepository = accountRepository; this.invoiceRepository = invoiceRepository;
        this.paymentRepository = paymentRepository; this.ledgerRepository = ledgerRepository;
        this.dictionaryDirectory = dictionaryDirectory;
        this.attributeDirectory = attributeDirectory; this.contextProvider = contextProvider;
        this.settlements = settlements;
    }

    @Transactional
    CreateResult create(CreateCommand input) {
        ExecutionContext context = requireWorkContext();
        String idempotencyKey = required(input.idempotencyKey(), "PAYMENT_IDEMPOTENCY_KEY_REQUIRED", "支付幂等键不能为空");
        PaymentOrder existing = orderRepository.findByTenantIdAndIdempotencyKey(context.tenantId(), idempotencyKey)
                .orElse(null);
        if (existing != null) return new CreateResult(verifySame(existing, input), true);

        Invoice invoice = invoiceRepository.findByIdAndTenantId(input.invoiceId(), context.tenantId())
                .orElseThrow(() -> notFound("INVOICE_NOT_FOUND", "未找到待支付结算凭证"));
        Settlement formalSettlement = settlements.requireForPayment(context, input.invoiceId());
        if (!Objects.equals(formalSettlement.legacyInvoiceId(), invoice.id())) {
            throw conflict("SETTLEMENT_INVOICE_LINK_INVALID", "正式结算单与兼容结算凭证关联不一致");
        }
        PatientAccount account = accountRepository.lockByIdAndTenantId(invoice.patientAccountId(), context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户"));
        requireAccess(context, account);
        existing = orderRepository.findByTenantIdAndIdempotencyKey(context.tenantId(), idempotencyKey).orElse(null);
        if (existing != null) return new CreateResult(verifySame(existing, input), true);

        BigDecimal amount = money(input.amount());
        if (amount.signum() <= 0) throw badRequest("PAYMENT_AMOUNT_INVALID", "支付金额必须大于零");
        if (invoice.netAmount().signum() <= 0) throw conflict("PAYMENT_CREDIT_INVOICE_INVALID", "贷项结算凭证不能执行收款");
        String paymentMethod = upper(input.paymentMethodCode());
        String paymentScene = upper(input.paymentSceneCode());
        String businessScene = upper(input.businessScene());
        if ("MEDICAL_INSURANCE".equals(paymentMethod)) {
            throw badRequest("PAYMENT_METHOD_CLASSIFICATION_INVALID",
                    "医保属于结算类型，不是患者支付方式；请在医保结算后选择个人自付支付方式");
        }
        if (businessScene == null) businessScene = "OUTPATIENT";
        if (!formalSettlement.settlementScene().equals(businessScene)) {
            throw conflict("PAYMENT_BUSINESS_SCENE_MISMATCH", "支付业务场景与结算单场景不一致");
        }
        if (paymentScene == null) paymentScene = "CASHIER";
        String methodName = dictionaryDirectory.resolveActiveItems(context.tenantId(), "PAY_METHOD").stream()
                .filter(value -> value.code().equals(paymentMethod)).map(value -> value.name()).findFirst()
                .orElseThrow(() -> badRequest("PAYMENT_METHOD_INVALID", "支付方式未启用或不存在"));
        if (!attributeDirectory.isApplicable(context.tenantId(), context.organizationId(), context.departmentId(),
                "PAY_METHOD", paymentMethod, "AVAILABLE_SCENE", paymentScene)) {
            throw badRequest("PAYMENT_METHOD_NOT_APPLICABLE", "当前支付方式不适用于所选结算场景");
        }
        BigDecimal paid = money(paymentRepository.netPaidForInvoice(context.tenantId(), invoice.id()));
        BigDecimal externallyFunded = money(settlements.nonPaymentTendered(context, formalSettlement.id()));
        BigDecimal reserved = money(orderRepository.activeRequestedForInvoice(context.tenantId(), invoice.id()));
        BigDecimal available = money(invoice.netAmount().subtract(paid).subtract(externallyFunded).subtract(reserved));
        if (amount.compareTo(available) > 0) {
            throw conflict("PAYMENT_ORDER_EXCEEDS_AVAILABLE", "支付金额超过结算凭证扣除在途支付后的未付金额");
        }
        if ("REGISTRATION".equals(businessScene) && amount.compareTo(available) != 0) {
            throw conflict("REGISTRATION_PAYMENT_MUST_BE_FULL", "挂号费必须一次足额支付");
        }
        if (input.expiresAt() != null && !input.expiresAt().isAfter(Instant.now())) {
            throw badRequest("PAYMENT_ORDER_EXPIRY_INVALID", "支付指令过期时间必须晚于当前时间");
        }
        String orderNo = "PO" + NUMBER_TIME.format(Instant.now()) + GlobalIds.randomSuffix(6);
        PaymentOrder value = orderRepository.save(new PaymentOrder(context.tenantId(), account.id(), invoice.id(),
                orderNo, idempotencyKey, businessScene, paymentScene, paymentMethod, methodName, amount,
                account.currencyCode(), clean(input.correlationId()) == null ? context.correlationId() : clean(input.correlationId()),
                clean(input.terminalCode()), input.expiresAt(), context.subjectId()));
        eventRepository.save(new PaymentEvent(context.tenantId(), value.id(), null, "CREATE", null, "CREATED",
                idempotencyKey, null, amount, null, null, context.subjectId()));
        settlements.recordPaymentRequested(context, formalSettlement.id(), value.id());
        return new CreateResult(value, false);
    }

    @Transactional
    CreateResult createRefund(CreateRefundCommand input) {
        ExecutionContext context = requireWorkContext();
        String idempotencyKey = required(input.idempotencyKey(), "REFUND_IDEMPOTENCY_KEY_REQUIRED", "退款幂等键不能为空");
        PaymentOrder existing = orderRepository.findByTenantIdAndIdempotencyKey(context.tenantId(), idempotencyKey)
                .orElse(null);
        if (existing != null) return new CreateResult(verifySameRefund(existing, input), true);

        Payment original = paymentRepository.findByIdAndTenantId(input.originalPaymentId(), context.tenantId())
                .orElseThrow(() -> notFound("PAYMENT_NOT_FOUND", "未找到原支付事实"));
        if (!"PAYMENT".equals(original.paymentType())) {
            throw conflict("REFUND_ORIGINAL_PAYMENT_INVALID", "只能对原始支付执行退款");
        }
        PatientAccount account = accountRepository.lockByIdAndTenantId(original.patientAccountId(), context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户"));
        requireAccess(context, account);
        existing = orderRepository.findByTenantIdAndIdempotencyKey(context.tenantId(), idempotencyKey).orElse(null);
        if (existing != null) return new CreateResult(verifySameRefund(existing, input), true);

        BigDecimal amount = money(input.amount());
        if (amount.signum() <= 0) throw badRequest("REFUND_AMOUNT_INVALID", "退款金额必须大于零");
        BigDecimal refunded = money(paymentRepository.refundedForPayment(context.tenantId(), original.id()));
        BigDecimal reserved = money(orderRepository.activeRefundRequestedForPayment(context.tenantId(), original.id()));
        BigDecimal paymentAvailable = money(original.amount().subtract(refunded).subtract(reserved));
        BigDecimal accountBalance = money(ledgerRepository.balance(context.tenantId(), account.id()));
        BigDecimal accountAvailable = accountBalance.signum() < 0
                ? money(accountBalance.abs().subtract(reserved)) : BigDecimal.ZERO.setScale(6);
        if (amount.compareTo(paymentAvailable) > 0) {
            throw conflict("REFUND_ORDER_EXCEEDS_PAYMENT", "退款金额超过原支付扣除已退及在途退款后的余额");
        }
        if (amount.compareTo(accountAvailable) > 0) {
            throw conflict("REFUND_ORDER_EXCEEDS_ACCOUNT_CREDIT", "退款金额超过退费事项形成并扣除在途退款后的账户可退余额");
        }
        String reason = required(input.reason(), "REFUND_REASON_REQUIRED", "退款原因不能为空");
        String orderNo = "RO" + NUMBER_TIME.format(Instant.now()) + GlobalIds.randomSuffix(6);
        PaymentOrder sourceOrder = original.paymentOrderId() == null ? null
                : orderRepository.findByIdAndTenantId(original.paymentOrderId(), context.tenantId()).orElse(null);
        String businessScene = sourceOrder == null ? "OUTPATIENT" : sourceOrder.businessScene();
        String scene = sourceOrder == null || sourceOrder.paymentSceneCode() == null
                ? "CASHIER" : sourceOrder.paymentSceneCode();
        String methodName = sourceOrder == null ? original.paymentMethodCode() : sourceOrder.paymentMethodNameSnapshot();
        PaymentOrder value = orderRepository.save(new PaymentOrder(context.tenantId(), account.id(),
                original.invoiceId(), original.id(), orderNo, idempotencyKey, businessScene, scene,
                original.paymentMethodCode(), methodName, "REFUND", amount, account.currencyCode(),
                clean(input.correlationId()) == null ? context.correlationId() : clean(input.correlationId()),
                clean(input.terminalCode()), null, context.subjectId()));
        eventRepository.save(new PaymentEvent(context.tenantId(), value.id(), null, "CREATE", null, "CREATED",
                idempotencyKey, null, amount, null, reason, context.subjectId()));
        return new CreateResult(value, false);
    }

    @Transactional
    TransitionResult transition(Long orderId, TransitionCommand input) {
        ExecutionContext context = requireWorkContext();
        PaymentOrder order = orderRepository.lockByIdAndTenantId(orderId, context.tenantId())
                .orElseThrow(() -> notFound("PAYMENT_ORDER_NOT_FOUND", "未找到支付指令"));
        requireAccess(context, accountRepository.findByIdAndTenantId(order.patientAccountId(), context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户")));
        String commandCode = required(input.commandCode(), "PAYMENT_EVENT_COMMAND_REQUIRED", "支付事件命令编码不能为空");
        if (eventRepository.findByTenantIdAndPaymentOrderIdAndCommandCode(
                context.tenantId(), order.id(), commandCode).isPresent()) {
            return new TransitionResult(order, true);
        }
        String next = upper(input.nextStatus()); String current = order.status();
        if (!allowed(current, next)) throw conflict("PAYMENT_ORDER_STATE_INVALID",
                "支付指令不能从 %s 迁移到 %s".formatted(current, next));
        BigDecimal captured = input.capturedAmount() == null ? order.capturedAmount() : money(input.capturedAmount());
        if (captured.signum() < 0 || captured.compareTo(order.requestedAmount()) > 0) {
            throw conflict("PAYMENT_CAPTURE_AMOUNT_INVALID", "支付成功金额不能小于零或超过申请金额");
        }
        if ("SUCCEEDED".equals(next) && captured.compareTo(order.requestedAmount()) != 0) {
            throw conflict("PAYMENT_CAPTURE_INCOMPLETE", "支付指令成功金额必须等于申请金额");
        }
        order.transition(next, captured, clean(input.externalOrderNo()), clean(input.errorCode()), clean(input.errorMessage()));
        eventRepository.save(new PaymentEvent(context.tenantId(), order.id(), input.externalMessageId(),
                upper(input.eventType()), current, next, commandCode, clean(input.externalTransactionNo()),
                input.eventAmount() == null ? null : money(input.eventAmount()),
                clean(input.errorCode()), clean(input.errorMessage()), context.subjectId()));
        return new TransitionResult(order, false);
    }

    @Transactional
    TransitionResult transitionRefund(Long orderId, RefundTransitionCommand input) {
        ExecutionContext context = requireWorkContext();
        PaymentOrder order = orderRepository.lockByIdAndTenantId(orderId, context.tenantId())
                .orElseThrow(() -> notFound("PAYMENT_ORDER_NOT_FOUND", "未找到退款指令"));
        requireAccess(context, accountRepository.findByIdAndTenantId(order.patientAccountId(), context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户")));
        if (!"REFUND".equals(order.orderType())) throw conflict("REFUND_ORDER_TYPE_INVALID", "当前指令不是退款指令");
        String commandCode = required(input.commandCode(), "REFUND_EVENT_COMMAND_REQUIRED", "退款事件命令编码不能为空");
        if (eventRepository.findByTenantIdAndPaymentOrderIdAndCommandCode(
                context.tenantId(), order.id(), commandCode).isPresent()) {
            return new TransitionResult(order, true);
        }
        String next = upper(input.nextStatus()); String current = order.status();
        if (!allowedRefund(current, next)) throw conflict("REFUND_ORDER_STATE_INVALID",
                "退款指令不能从 %s 迁移到 %s".formatted(current, next));
        BigDecimal amount = input.refundedAmount() == null ? order.refundedAmount() : money(input.refundedAmount());
        if (amount.signum() < 0 || amount.compareTo(order.requestedAmount()) > 0) {
            throw conflict("REFUND_RESULT_AMOUNT_INVALID", "退款成功金额不能小于零或超过申请金额");
        }
        if ("REFUNDED".equals(next) && amount.compareTo(order.requestedAmount()) != 0) {
            throw conflict("REFUND_RESULT_INCOMPLETE", "退款完成金额必须等于申请金额");
        }
        order.transitionRefund(next, amount, clean(input.externalOrderNo()), clean(input.errorCode()), clean(input.errorMessage()));
        eventRepository.save(new PaymentEvent(context.tenantId(), order.id(), input.externalMessageId(),
                upper(input.eventType()), current, next, commandCode, clean(input.externalTransactionNo()),
                input.eventAmount() == null ? null : money(input.eventAmount()), clean(input.errorCode()),
                clean(input.errorMessage()), context.subjectId()));
        return new TransitionResult(order, false);
    }

    @Transactional(readOnly = true)
    PaymentOrder requireByOrderNo(String orderNo) {
        ExecutionContext context = requireWorkContext();
        PaymentOrder value = orderRepository.findByTenantIdAndOrderNo(context.tenantId(), required(orderNo,
                "PAYMENT_ORDER_NO_REQUIRED", "支付指令编码不能为空"))
                .orElseThrow(() -> notFound("PAYMENT_ORDER_NOT_FOUND", "未找到支付指令"));
        requireAccess(context, accountRepository.findByIdAndTenantId(value.patientAccountId(), context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户")));
        return value;
    }

    @Transactional(readOnly = true)
    PaymentOrder require(Long orderId) {
        ExecutionContext context = requireWorkContext();
        PaymentOrder value = orderRepository.findByIdAndTenantId(orderId, context.tenantId())
                .orElseThrow(() -> notFound("PAYMENT_ORDER_NOT_FOUND", "未找到支付指令"));
        requireAccess(context, accountRepository.findByIdAndTenantId(value.patientAccountId(), context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户")));
        return value;
    }

    @Transactional(readOnly = true)
    Payment requireOriginalPayment(PaymentOrder order) {
        ExecutionContext context = requireWorkContext();
        if (order.originalPaymentId() == null) throw conflict("REFUND_ORIGINAL_PAYMENT_MISSING", "退款指令缺少原支付关联");
        Payment value = paymentRepository.findByIdAndTenantId(order.originalPaymentId(), context.tenantId())
                .orElseThrow(() -> notFound("PAYMENT_NOT_FOUND", "未找到原支付事实"));
        requireAccess(context, accountRepository.findByIdAndTenantId(value.patientAccountId(), context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户")));
        return value;
    }

    @Transactional(readOnly = true)
    PaymentOrderView view(Long orderId, boolean duplicate) {
        ExecutionContext context = requireWorkContext();
        PaymentOrder value = orderRepository.findByIdAndTenantId(orderId, context.tenantId())
                .orElseThrow(() -> notFound("PAYMENT_ORDER_NOT_FOUND", "未找到支付指令"));
        requireAccess(context, accountRepository.findByIdAndTenantId(value.patientAccountId(), context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户")));
        List<PaymentEventView> events = eventRepository
                .findByTenantIdAndPaymentOrderIdOrderByOccurredAtAscIdAsc(context.tenantId(), value.id())
                .stream().map(this::eventView).toList();
        return new PaymentOrderView(value.id(), value.revision(), value.patientAccountId(), value.invoiceId(), value.originalPaymentId(),
                value.orderNo(), value.idempotencyKey(), value.businessScene(), value.paymentSceneCode(),
                value.paymentMethodCode(), value.paymentMethodNameSnapshot(), value.orderType(), value.status(),
                value.requestedAmount(), value.capturedAmount(), value.refundedAmount(), value.currencyCode(),
                value.externalOrderNo(), value.correlationId(), value.terminalCode(), value.expiresAt(),
                value.createdAt(), value.updatedAt(), value.errorCode(), value.errorMessage(), duplicate, events);
    }

    @Transactional(readOnly = true)
    List<PaymentOrderView> listByAccount(Long accountId) {
        ExecutionContext context = requireWorkContext();
        PatientAccount account = accountRepository.findByIdAndTenantId(accountId, context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户"));
        requireAccess(context, account);
        return orderRepository.findTop100ByTenantIdAndPatientAccountIdOrderByCreatedAtDesc(
                context.tenantId(), accountId).stream().map(value -> view(value.id(), false)).toList();
    }

    @Transactional(readOnly = true)
    List<PaymentOrderView> recoveryWorklist(int limit) {
        ExecutionContext context = requireWorkContext();
        return orderRepository.findRecoveryWorklist(context.tenantId(), context.organizationId(),
                        context.departmentId(), PageRequest.of(0, Math.max(1, Math.min(limit, 100))))
                .stream().map(value -> view(value.id(), false)).toList();
    }

    private PaymentOrder verifySame(PaymentOrder value, CreateCommand input) {
        if (!Objects.equals(value.invoiceId(), input.invoiceId())
                || value.requestedAmount().compareTo(money(input.amount())) != 0
                || !value.paymentMethodCode().equals(upper(input.paymentMethodCode()))
                || !value.paymentSceneCode().equals(upper(input.paymentSceneCode()) == null ? "CASHIER" : upper(input.paymentSceneCode()))) {
            throw conflict("PAYMENT_IDEMPOTENCY_KEY_REUSED", "支付幂等键已被不同支付内容使用");
        }
        return value;
    }

    private PaymentOrder verifySameRefund(PaymentOrder value, CreateRefundCommand input) {
        if (!"REFUND".equals(value.orderType())
                || !Objects.equals(value.originalPaymentId(), input.originalPaymentId())
                || value.requestedAmount().compareTo(money(input.amount())) != 0) {
            throw conflict("REFUND_IDEMPOTENCY_KEY_REUSED", "退款幂等键已被不同退款内容使用");
        }
        return value;
    }

    private boolean allowed(String current, String next) {
        if (current.equals(next)) return true;
        return switch (current) {
            case "CREATED" -> Set.of("PROCESSING", "PENDING", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED").contains(next);
            case "PROCESSING", "PENDING" -> Set.of("PENDING", "PARTIAL", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED").contains(next);
            case "PARTIAL" -> Set.of("PROCESSING", "PENDING", "SUCCEEDED", "FAILED", "CANCELLED").contains(next);
            default -> false;
        };
    }

    private boolean allowedRefund(String current, String next) {
        if (current.equals(next)) return true;
        return switch (current) {
            case "CREATED" -> Set.of("REFUNDING", "PENDING", "REFUNDED", "FAILED", "CANCELLED").contains(next);
            case "REFUNDING", "PENDING" -> Set.of("PENDING", "REFUNDED", "FAILED", "CANCELLED").contains(next);
            default -> false;
        };
    }

    private PaymentEventView eventView(PaymentEvent value) {
        return new PaymentEventView(value.id(), value.externalMessageId(), value.eventType(), value.statusFrom(),
                value.statusTo(), value.commandCode(), value.externalTransactionNo(), value.eventAmount(),
                value.errorCode(), value.errorMessage(), value.occurredAt());
    }

    private ExecutionContext requireWorkContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.departmentId() == null) {
            throw forbidden("BILLING_WORK_CONTEXT_REQUIRED", "收费支付操作前必须选择工作机构和科室");
        }
        return context;
    }

    private void requireAccess(ExecutionContext context, PatientAccount account) {
        if (!context.canAccessOrganization(account.organizationId()) || !context.canAccessDepartment(account.departmentId())) {
            throw forbidden("PATIENT_ACCOUNT_FORBIDDEN", "当前工作上下文不能访问该费用账户");
        }
    }

    private BigDecimal money(BigDecimal value) {
        if (value == null) throw badRequest("PAYMENT_AMOUNT_REQUIRED", "支付金额不能为空");
        return value.setScale(6, RoundingMode.HALF_UP);
    }
    private String required(String value, String code, String message) {
        String result = clean(value); if (result == null) throw badRequest(code, message); return result;
    }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String upper(String value) { String result = clean(value); return result == null ? null : result.toUpperCase(); }

    record CreateCommand(Long invoiceId, String idempotencyKey, String businessScene, String paymentSceneCode,
                         String paymentMethodCode, BigDecimal amount, String correlationId, String terminalCode,
                         Instant expiresAt) {}
    record CreateRefundCommand(Long originalPaymentId, String idempotencyKey, BigDecimal amount, String reason,
                               String correlationId, String terminalCode) {}
    record CreateResult(PaymentOrder order, boolean duplicate) {}
    record TransitionCommand(String eventType, String nextStatus, String commandCode, Long externalMessageId,
                             String externalOrderNo, String externalTransactionNo, BigDecimal eventAmount,
                             BigDecimal capturedAmount, String errorCode, String errorMessage) {}
    record TransitionResult(PaymentOrder order, boolean duplicate) {}
    record RefundTransitionCommand(String eventType, String nextStatus, String commandCode, Long externalMessageId,
                                   String externalOrderNo, String externalTransactionNo, BigDecimal eventAmount,
                                   BigDecimal refundedAmount, String errorCode, String errorMessage) {}
}
