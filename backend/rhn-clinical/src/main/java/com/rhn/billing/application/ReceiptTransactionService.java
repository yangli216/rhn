package com.rhn.billing.application;

import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptInstruction;
import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptLine;
import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptAction;
import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptResult;
import com.rhn.billing.api.ReceiptViews.ReceiptEventView;
import com.rhn.billing.api.ReceiptViews.ReceiptView;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.Receipt;
import com.rhn.billing.domain.ReceiptEvent;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.ReceiptEventRepository;
import com.rhn.billing.infrastructure.ReceiptRepository;
import com.rhn.billing.infrastructure.SettlementLineRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class ReceiptTransactionService {
    private final ReceiptRepository receipts;
    private final ReceiptEventRepository events;
    private final SettlementRepository settlements;
    private final SettlementLineRepository settlementLines;
    private final ChargeItemRepository charges;
    private final PatientAccountRepository accounts;
    private final ExecutionContextProvider contextProvider;

    ReceiptTransactionService(ReceiptRepository receipts, ReceiptEventRepository events,
                              SettlementRepository settlements, SettlementLineRepository settlementLines,
                              ChargeItemRepository charges, PatientAccountRepository accounts,
                              ExecutionContextProvider contextProvider) {
        this.receipts = receipts; this.events = events; this.settlements = settlements;
        this.settlementLines = settlementLines; this.charges = charges; this.accounts = accounts;
        this.contextProvider = contextProvider;
    }

    @Transactional
    CreateResult create(CreateCommand input) {
        ExecutionContext context = contextProvider.requireCurrent();
        String command = required(input.idempotencyKey(), "RECEIPT_IDEMPOTENCY_REQUIRED", "票据请求必须提供幂等编码");
        Receipt replay = receipts.findByTenantIdAndCommandCode(context.tenantId(), command).orElse(null);
        if (replay != null) return new CreateResult(verifyReplay(replay, input), true);
        Settlement settlement = settlements.findByIdAndTenantId(input.settlementId(), context.tenantId())
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到正式结算单"));
        if (!"SETTLED".equals(settlement.status())) throw conflict("RECEIPT_SETTLEMENT_NOT_FINAL", "只有已结清结算单可以申请票据");
        PatientAccount account = requireAccess(context, settlement.patientAccountId());
        String type = upper(input.receiptType());
        if (!List.of("MEDICAL_E_INVOICE", "PAPER_INVOICE", "RECEIPT", "VIRTUAL").contains(type)) {
            throw badRequest("RECEIPT_TYPE_INVALID", "票据类型不正确");
        }
        String channel = upper(input.issueChannel());
        if (!List.of("CASHIER", "SELF_SERVICE", "MOBILE", "ONLINE").contains(channel)) {
            throw badRequest("RECEIPT_CHANNEL_INVALID", "票据开具渠道不正确");
        }
        String authority = clean(input.fiscalAuthorityCode());
        if (authority == null) authority = List.of("RECEIPT", "VIRTUAL").contains(type) ? "LOCAL" : null;
        if (authority == null) throw badRequest("FISCAL_AUTHORITY_REQUIRED", "财政票据必须指定财政平台编码");
        Receipt value = receipts.save(new Receipt(context.tenantId(), settlement.id(), command, type,
                authority.toUpperCase(), settlement.netAmount(), settlement.currencyCode(), channel,
                clean(input.payerName()), clean(input.payerIdentityDigest()),
                clean(input.correlationId()) == null ? context.correlationId() : clean(input.correlationId()),
                context.subjectId()));
        events.save(new ReceiptEvent(context.tenantId(), value.id(), null, "REQUEST", null, "REQUESTED",
                "REQUEST-" + command, context.subjectId(), null, null));
        return new CreateResult(value, false);
    }

    @Transactional
    CreateResult createRedFlush(Long originalReceiptId, String idempotencyKey, String reason, String correlationId) {
        ExecutionContext context = contextProvider.requireCurrent();
        String command = required(idempotencyKey, "RECEIPT_RED_FLUSH_COMMAND_REQUIRED", "红冲必须提供幂等编码");
        Receipt replay = receipts.findByTenantIdAndCommandCode(context.tenantId(), command).orElse(null);
        if (replay != null) {
            if (!Objects.equals(replay.reversesReceiptId(), originalReceiptId)) {
                throw conflict("RECEIPT_RED_FLUSH_IDEMPOTENCY_MISMATCH", "幂等编码已用于其他红冲请求");
            }
            ReceiptEvent request = events.findByTenantIdAndReceiptIdAndCommandCode(
                    context.tenantId(), replay.id(), command).orElseThrow();
            if (!Objects.equals(request.actionReason(), clean(reason))) {
                throw conflict("RECEIPT_RED_FLUSH_IDEMPOTENCY_MISMATCH", "幂等编码对应的红冲原因不一致");
            }
            require(originalReceiptId, context);
            return new CreateResult(replay, true);
        }
        Receipt original = receipts.lockByIdAndTenantId(originalReceiptId, context.tenantId())
                .orElseThrow(() -> notFound("RECEIPT_NOT_FOUND", "未找到原票据"));
        require(original.id(), context);
        if (!"ISSUED".equals(original.status())) {
            throw conflict("RECEIPT_NOT_RED_FLUSHABLE", "只有已开具且未作废的票据可以红冲");
        }
        Receipt existing = receipts.findByTenantIdAndReversesReceiptId(context.tenantId(), originalReceiptId).orElse(null);
        if (existing != null) throw conflict("RECEIPT_ALREADY_RED_FLUSHED", "原票据已经存在红冲票据");
        Receipt value = receipts.save(Receipt.redFlushOf(original, command,
                clean(correlationId) == null ? context.correlationId() : clean(correlationId), context.subjectId()));
        events.save(new ReceiptEvent(context.tenantId(), value.id(), null, "RED_FLUSH", null, "REQUESTED",
                command, context.subjectId(), requiredReason(reason, "RECEIPT_RED_FLUSH_REASON_REQUIRED", "红冲原因不能为空"),
                null, null));
        return new CreateResult(value, false);
    }

    @Transactional(readOnly = true)
    ReceiptInstruction instruction(Long receiptId) {
        ExecutionContext context = contextProvider.requireCurrent();
        Receipt receipt = require(receiptId, context);
        Settlement settlement = settlements.findByIdAndTenantId(receipt.settlementId(), context.tenantId()).orElseThrow();
        List<com.rhn.billing.domain.SettlementLine> lines = settlementLines
                .findByTenantIdAndSettlementIdOrderByLineNoAsc(context.tenantId(), settlement.id());
        Map<Long, ChargeItem> byId = charges.findAllById(lines.stream().map(com.rhn.billing.domain.SettlementLine::chargeItemId).toList())
                .stream().collect(Collectors.toMap(ChargeItem::id, value -> value));
        List<ReceiptLine> receiptLines = lines.stream().map(line -> {
            ChargeItem charge = byId.get(line.chargeItemId());
            return new ReceiptLine(line.lineNo(), category(charge), charge.itemCodeSnapshot(),
                    charge.itemNameSnapshot(), line.settledQuantity(), line.netAmount());
        }).toList();
        return new ReceiptInstruction(receipt.id(), settlement.id(), receipt.receiptNo(), receipt.commandCode(),
                receipt.receiptType(), receipt.issueChannel(), receipt.fiscalAuthorityCode(), receipt.externalReceiptNo(), receipt.payerName(),
                receipt.payerIdentityDigest(), receipt.receiptAmount(), receipt.currencyCode(),
                settlement.insuranceAmount(), BigDecimal.ZERO, settlement.patientAmount(), receiptLines,
                receipt.correlationId());
    }

    @Transactional
    void recordQueued(Long receiptId, Long externalMessageId) {
        ExecutionContext context = contextProvider.requireCurrent();
        Receipt value = require(receiptId, context);
        String command = "QUEUE-" + externalMessageId;
        if (events.findByTenantIdAndReceiptIdAndCommandCode(context.tenantId(), receiptId, command).isEmpty()) {
            events.save(new ReceiptEvent(context.tenantId(), receiptId, externalMessageId, "REQUEST",
                    value.status(), value.status(), command, context.subjectId(), null, null));
        }
    }

    @Transactional
    void applyIssueResult(Long receiptId, ReceiptResult result, String commandCode, Long externalMessageId) {
        ExecutionContext context = contextProvider.requireCurrent();
        Receipt value = receipts.lockByIdAndTenantId(receiptId, context.tenantId())
                .orElseThrow(() -> notFound("RECEIPT_NOT_FOUND", "未找到票据请求"));
        if (events.findByTenantIdAndReceiptIdAndCommandCode(context.tenantId(), receiptId, commandCode).isPresent()) return;
        String previous;
        try { previous = value.applyIssueResult(result); }
        catch (IllegalStateException exception) {
            throw conflict("RECEIPT_STATE_INVALID", exception.getMessage());
        }
        String event = switch (result.outcome()) {
            case ISSUED -> "ISSUE"; case FAILED -> "FAIL"; case VOIDED -> "VOID";
            case RED_FLUSHED -> "RED_FLUSH"; case PENDING -> "REQUEST";
        };
        events.save(new ReceiptEvent(context.tenantId(), receiptId, externalMessageId, event, previous,
                value.status(), commandCode, context.subjectId(), result.errorCode(), truncate(result.errorMessage(), 2000)));
    }

    @Transactional
    void applyVoidResult(Long receiptId, ReceiptResult result, String commandCode, Long externalMessageId,
                         String actionReason) {
        ExecutionContext context = contextProvider.requireCurrent();
        Receipt value = receipts.lockByIdAndTenantId(receiptId, context.tenantId())
                .orElseThrow(() -> notFound("RECEIPT_NOT_FOUND", "未找到票据请求"));
        if (events.findByTenantIdAndReceiptIdAndCommandCode(context.tenantId(), receiptId, commandCode).isPresent()) return;
        String previous;
        try { previous = value.applyVoidResult(result); }
        catch (IllegalStateException exception) {
            throw conflict("RECEIPT_STATE_INVALID", exception.getMessage());
        }
        events.save(new ReceiptEvent(context.tenantId(), receiptId, externalMessageId, "VOID", previous,
                value.status(), commandCode, context.subjectId(), clean(actionReason), result.errorCode(),
                truncate(result.errorMessage(), 2000)));
    }

    @Transactional
    void applyRedFlushResult(Long receiptId, ReceiptResult result, String commandCode, Long externalMessageId,
                             String actionReason) {
        ExecutionContext context = contextProvider.requireCurrent();
        Receipt value = receipts.lockByIdAndTenantId(receiptId, context.tenantId())
                .orElseThrow(() -> notFound("RECEIPT_NOT_FOUND", "未找到红冲票据"));
        if (events.findByTenantIdAndReceiptIdAndCommandCode(context.tenantId(), receiptId, commandCode).isPresent()) return;
        String previous;
        try { previous = value.applyRedFlushResult(result); }
        catch (IllegalStateException exception) {
            throw conflict("RECEIPT_STATE_INVALID", exception.getMessage());
        }
        events.save(new ReceiptEvent(context.tenantId(), receiptId, externalMessageId, "RED_FLUSH", previous,
                value.status(), commandCode, context.subjectId(), clean(actionReason), result.errorCode(),
                truncate(result.errorMessage(), 2000)));
    }

    @Transactional(readOnly = true)
    ReceiptAction voidInstruction(Long receiptId, String idempotencyKey, String reason) {
        ExecutionContext context = contextProvider.requireCurrent();
        Receipt value = require(receiptId, context);
        if (!"ISSUED".equals(value.status()) && !"VOIDED".equals(value.status())) {
            throw conflict("RECEIPT_NOT_VOIDABLE", "只有已开具票据可以作废");
        }
        String command = required(idempotencyKey, "RECEIPT_VOID_COMMAND_REQUIRED", "作废必须提供幂等编码");
        return new ReceiptAction(value.id(), value.receiptNo(), command, value.externalReceiptNo(),
                requiredReason(reason, "RECEIPT_VOID_REASON_REQUIRED", "作废原因不能为空"), value.correlationId());
    }

    @Transactional(readOnly = true)
    ReceiptAction redFlushInstruction(Long receiptId, String reason) {
        ExecutionContext context = contextProvider.requireCurrent();
        Receipt reversal = require(receiptId, context);
        if (reversal.reversesReceiptId() == null) throw conflict("RECEIPT_NOT_RED_FLUSH", "当前票据不是红冲票据");
        Receipt original = require(reversal.reversesReceiptId(), context);
        return new ReceiptAction(reversal.id(), reversal.receiptNo(), reversal.commandCode(),
                original.externalReceiptNo(), requiredReason(reason, "RECEIPT_RED_FLUSH_REASON_REQUIRED", "红冲原因不能为空"),
                reversal.correlationId());
    }

    @Transactional(readOnly = true)
    Receipt requireByReceiptNo(String receiptNo) {
        ExecutionContext context = contextProvider.requireCurrent();
        Receipt value = receipts.findByTenantIdAndReceiptNo(context.tenantId(), required(receiptNo,
                        "RECEIPT_REQUEST_NO_REQUIRED", "票据申请号不能为空"))
                .orElseThrow(() -> notFound("RECEIPT_NOT_FOUND", "未找到票据请求"));
        require(value.id(), context);
        return value;
    }

    @Transactional(readOnly = true)
    boolean eventApplied(Long receiptId, String commandCode) {
        ExecutionContext context = contextProvider.requireCurrent();
        require(receiptId, context);
        return events.findByTenantIdAndReceiptIdAndCommandCode(context.tenantId(), receiptId,
                required(commandCode, "RECEIPT_EVENT_COMMAND_REQUIRED", "票据事件命令编码不能为空")).isPresent();
    }

    @Transactional(readOnly = true)
    boolean actionApplied(Long receiptId, String commandCode, String reason) {
        ExecutionContext context = contextProvider.requireCurrent();
        require(receiptId, context);
        ReceiptEvent event = events.findByTenantIdAndReceiptIdAndCommandCode(context.tenantId(), receiptId,
                required(commandCode, "RECEIPT_EVENT_COMMAND_REQUIRED", "票据事件命令编码不能为空")).orElse(null);
        if (event == null) return false;
        if (!Objects.equals(event.actionReason(), clean(reason))) {
            throw conflict("RECEIPT_ACTION_IDEMPOTENCY_MISMATCH", "幂等编码对应的票据操作原因不一致");
        }
        return true;
    }

    @Transactional(readOnly = true)
    ReceiptView get(Long receiptId, boolean duplicate) {
        ExecutionContext context = contextProvider.requireCurrent();
        return view(context, require(receiptId, context), duplicate);
    }

    @Transactional(readOnly = true)
    List<ReceiptView> listBySettlement(Long settlementId) {
        ExecutionContext context = contextProvider.requireCurrent();
        Settlement settlement = settlements.findByIdAndTenantId(settlementId, context.tenantId())
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到正式结算单"));
        requireAccess(context, settlement.patientAccountId());
        return receipts.findByTenantIdAndSettlementIdOrderByCreatedAtAscIdAsc(context.tenantId(), settlementId)
                .stream().map(value -> view(context, value, false)).toList();
    }

    @Transactional(readOnly = true)
    List<ReceiptView> recoveryWorklist(int limit) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) throw forbidden(
                "BILLING_WORK_CONTEXT_REQUIRED", "票据恢复前必须选择工作机构");
        return receipts.findRecoveryWorklist(context.tenantId(), context.organizationId(),
                        List.of("REQUESTED", "FAILED"), PageRequest.of(0, Math.max(1, Math.min(limit, 100))))
                .stream().map(value -> view(context, value, false)).toList();
    }

    @Transactional
    ReceiptView print(Long receiptId, String commandCode) {
        ExecutionContext context = contextProvider.requireCurrent();
        Receipt value = require(receiptId, context);
        if (!List.of("ISSUED", "RED_FLUSHED").contains(value.status())) {
            throw conflict("RECEIPT_NOT_PRINTABLE", "只有已开具或已红冲票据可以记录打印");
        }
        String command = required(commandCode, "RECEIPT_PRINT_COMMAND_REQUIRED", "打印必须提供幂等编码");
        if (events.findByTenantIdAndReceiptIdAndCommandCode(context.tenantId(), receiptId, command).isEmpty()) {
            events.save(new ReceiptEvent(context.tenantId(), receiptId, null, "PRINT", value.status(), value.status(),
                    command, context.subjectId(), null, null));
        }
        return view(context, value, false);
    }

    private Receipt verifyReplay(Receipt value, CreateCommand input) {
        if (!value.settlementId().equals(input.settlementId())
                || !value.receiptType().equals(upper(input.receiptType()))
                || !value.issueChannel().equals(upper(input.issueChannel()))
                || !Objects.equals(value.fiscalAuthorityCode(), normalizedAuthority(input))
                || !Objects.equals(value.payerName(), clean(input.payerName()))
                || !Objects.equals(value.payerIdentityDigest(), clean(input.payerIdentityDigest()))) {
            throw conflict("RECEIPT_IDEMPOTENCY_MISMATCH", "幂等编码已用于不同的票据请求");
        }
        return value;
    }

    private String normalizedAuthority(CreateCommand input) {
        String type = upper(input.receiptType());
        String authority = clean(input.fiscalAuthorityCode());
        if (authority == null && List.of("RECEIPT", "VIRTUAL").contains(type)) authority = "LOCAL";
        return authority == null ? null : authority.toUpperCase();
    }

    private Receipt require(Long id, ExecutionContext context) {
        Receipt value = receipts.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("RECEIPT_NOT_FOUND", "未找到票据请求"));
        Settlement settlement = settlements.findByIdAndTenantId(value.settlementId(), context.tenantId()).orElseThrow();
        requireAccess(context, settlement.patientAccountId()); return value;
    }

    private PatientAccount requireAccess(ExecutionContext context, Long accountId) {
        PatientAccount account = accounts.findByIdAndTenantId(accountId, context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户"));
        if (!context.hasWorkContext() || !context.canAccessOrganization(account.organizationId())) {
            throw forbidden("RECEIPT_FORBIDDEN", "当前工作上下文不能访问该票据");
        }
        return account;
    }

    private ReceiptView view(ExecutionContext context, Receipt value, boolean duplicate) {
        List<ReceiptEventView> eventViews = events.findByTenantIdAndReceiptIdOrderByOccurredAtAscIdAsc(
                        context.tenantId(), value.id()).stream().map(event -> new ReceiptEventView(event.id(),
                        event.externalMessageId(), event.eventType(), event.statusFrom(), event.statusTo(),
                        event.commandCode(), event.actorId(), event.errorCode(), event.actionReason(),
                        event.errorMessage(), event.occurredAt()))
                .toList();
        return new ReceiptView(value.id(), value.revision(), value.settlementId(), value.reversesReceiptId(),
                value.receiptNo(), value.commandCode(), value.receiptType(), value.status(), value.fiscalAuthorityCode(),
                value.externalReceiptNo(), value.fiscalCode(), value.fiscalNumber(), value.verificationCode(), value.controlledObjectReference(),
                value.receiptAmount(), value.currencyCode(), value.issueChannel(), value.payerName(), value.correlationId(),
                value.createdBy(), value.createdAt(), value.issuedAt(), value.updatedAt(), value.errorCode(),
                value.errorMessage(), duplicate, eventViews);
    }

    private String category(ChargeItem value) {
        if (value.accountingCategory() != null && !value.accountingCategory().isBlank()) {
            return value.accountingCategory().trim();
        }
        if ("DIRECT_VISIT_SERVICE".equals(value.sourceType())) return "TREATMENT";
        return "REGISTRATION".equals(value.sourceType()) ? "REGISTRATION" : "MEDICATION";
    }
    private String required(String value, String code, String message) {
        if (value == null || value.isBlank() || value.trim().length() > 128) throw badRequest(code, message);
        return value.trim();
    }
    private String requiredReason(String value, String code, String message) {
        if (value == null || value.isBlank() || value.trim().length() > 500) throw badRequest(code, message);
        return value.trim();
    }
    private String upper(String value) { return clean(value) == null ? null : clean(value).toUpperCase(); }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String truncate(String value, int max) { return value == null || value.length() <= max ? value : value.substring(0, max); }

    record CreateCommand(Long settlementId, String idempotencyKey, String receiptType, String issueChannel,
                         String fiscalAuthorityCode, String payerName, String payerIdentityDigest,
                         String correlationId) {}
    record CreateResult(Receipt receipt, boolean duplicate) {}
}
