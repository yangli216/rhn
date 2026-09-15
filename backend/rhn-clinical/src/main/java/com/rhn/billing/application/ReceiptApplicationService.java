package com.rhn.billing.application;

import com.rhn.billing.api.FiscalReceiptAdapter;
import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptAction;
import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptInstruction;
import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptResult;
import com.rhn.billing.api.FiscalReceiptResultDirectory;
import com.rhn.billing.api.FiscalReceiptResultDirectory.VerifiedReceiptResult;
import com.rhn.billing.api.ReceiptViews.ReceiptView;
import com.rhn.billing.domain.Receipt;
import com.rhn.platform.integration.api.ExternalMessageService;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.idempotency.CommandCodes;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
public class ReceiptApplicationService implements FiscalReceiptResultDirectory {
    private final ReceiptTransactionService transactions;
    private final List<FiscalReceiptAdapter> adapters;
    private final ExternalMessageService messages;
    private final ExecutionContextProvider contextProvider;

    public ReceiptApplicationService(ReceiptTransactionService transactions, List<FiscalReceiptAdapter> adapters,
                                     ExternalMessageService messages, ExecutionContextProvider contextProvider) {
        this.transactions = transactions; this.adapters = List.copyOf(adapters); this.messages = messages;
        this.contextProvider = contextProvider;
    }

    public ReceiptView issue(IssueReceiptCommand input) {
        var created = transactions.create(new ReceiptTransactionService.CreateCommand(input.settlementId(),
                input.idempotencyKey(), input.receiptType(), input.issueChannel(), input.fiscalAuthorityCode(),
                input.payerName(), input.payerIdentityDigest(), input.correlationId()));
        if (created.duplicate() || "ISSUED".equals(created.receipt().status())) {
            return transactions.get(created.receipt().id(), created.duplicate());
        }
        dispatchIssue(created.receipt().id(), operationCommand("ISSUE-", created.receipt().commandCode()));
        return transactions.get(created.receipt().id(), false);
    }

    public ReceiptView retry(Long receiptId, String commandCode, String reason) {
        ReceiptView value = transactions.get(receiptId, false);
        if (!List.of("REQUESTED", "FAILED").contains(value.status())) {
            throw conflict("RECEIPT_NOT_RETRYABLE", "当前票据状态不允许重试开具");
        }
        String command = operationCommand("ISSUE-RETRY-", commandCode);
        if (!transactions.eventApplied(receiptId, command)) {
            if (value.reversesReceiptId() == null) dispatchIssue(receiptId, command);
            else dispatchRedFlush(receiptId, command, reason);
        }
        return transactions.get(receiptId, false);
    }

    public ReceiptView query(Long receiptId, String commandCode) {
        ReceiptView value = transactions.get(receiptId, false);
        if ("ISSUED".equals(value.status())) return value;
        if (!List.of("REQUESTED", "FAILED").contains(value.status())) {
            throw conflict("RECEIPT_NOT_QUERYABLE", "当前票据状态不允许查询开具结果");
        }
        String command = operationCommand("QUERY-", commandCode);
        if (transactions.eventApplied(receiptId, command)) return transactions.get(receiptId, true);
        ReceiptInstruction instruction = transactions.instruction(receiptId);
        FiscalReceiptAdapter adapter = adapter(instruction);
        if (adapter == null) {
            enqueueQuery(instruction, command);
            return transactions.get(receiptId, false);
        }
        ReceiptResult result;
        try {
            result = adapter.query(instruction.receiptRequestNo(), instruction.externalReceiptNo(), instruction.correlationId());
        } catch (RuntimeException exception) {
            result = pending(exception);
        }
        if (value.reversesReceiptId() == null) transactions.applyIssueResult(receiptId, result, command, null);
        else transactions.applyRedFlushResult(receiptId, result, command, null, null);
        return transactions.get(receiptId, false);
    }

    public ReceiptView voidReceipt(Long receiptId, String idempotencyKey, String reason) {
        String command = operationCommand("VOID-", idempotencyKey);
        if (transactions.actionApplied(receiptId, command, reason)) return transactions.get(receiptId, true);
        ReceiptAction instruction = transactions.voidInstruction(receiptId, idempotencyKey, reason);
        ReceiptView value = transactions.get(receiptId, false);
        if ("VOIDED".equals(value.status())) return value;
        FiscalReceiptAdapter adapter = adapters.stream().filter(candidate -> candidate.supports(
                value.fiscalAuthorityCode(), value.receiptType())).findFirst().orElse(null);
        if (adapter == null) {
            enqueueAction(value, instruction, "RECEIPT_VOID");
            return transactions.get(receiptId, false);
        }
        ReceiptResult result;
        try { result = adapter.voidReceipt(instruction); }
        catch (RuntimeException exception) { result = pending(exception); }
        transactions.applyVoidResult(receiptId, result, command, null, reason);
        return transactions.get(receiptId, false);
    }

    public ReceiptView redFlush(Long receiptId, String idempotencyKey, String reason, String correlationId) {
        var created = transactions.createRedFlush(receiptId, idempotencyKey, reason, correlationId);
        ReceiptView value = transactions.get(created.receipt().id(), created.duplicate());
        if (created.duplicate() || "RED_FLUSHED".equals(value.status())) return value;
        ReceiptAction instruction = transactions.redFlushInstruction(value.id(), reason);
        FiscalReceiptAdapter adapter = adapters.stream().filter(candidate -> candidate.supports(
                value.fiscalAuthorityCode(), value.receiptType())).findFirst().orElse(null);
        if (adapter == null) {
            enqueueAction(value, instruction, "RECEIPT_RED_FLUSH");
            return transactions.get(value.id(), false);
        }
        ReceiptResult result;
        try { result = adapter.redFlush(instruction); }
        catch (RuntimeException exception) { result = pending(exception); }
        transactions.applyRedFlushResult(value.id(), result, operationCommand("RED-FLUSH-", idempotencyKey), null, reason);
        return transactions.get(value.id(), false);
    }

    public ReceiptView get(Long receiptId) { return transactions.get(receiptId, false); }
    public List<ReceiptView> listBySettlement(Long settlementId) { return transactions.listBySettlement(settlementId); }
    public ReceiptView print(Long receiptId, String commandCode) { return transactions.print(receiptId, commandCode); }
    public List<ReceiptView> recoveryWorklist(int limit) { return transactions.recoveryWorklist(limit); }

    public List<RecoveryResult> recoverPending(String batchCode, int limit) {
        String prefix = required(batchCode);
        return transactions.recoveryWorklist(limit).stream().map(item -> {
            try {
                ReceiptView result = query(item.id(), prefix + "-" + item.id());
                return new RecoveryResult(item.id(), result.status(), true, null, null);
            } catch (RuntimeException exception) {
                return new RecoveryResult(item.id(), item.status(), false,
                        exception.getClass().getSimpleName(), exception.getMessage());
            }
        }).toList();
    }

    @Override
    public ReceiptView accept(VerifiedReceiptResult input) {
        if (input.operation() == null) throw com.rhn.shared.api.BusinessErrors.badRequest(
                "RECEIPT_RESULT_OPERATION_REQUIRED", "票据回调必须标明操作类型");
        Receipt receipt = transactions.requireByReceiptNo(input.receiptRequestNo());
        if (!receipt.fiscalAuthorityCode().equals(normalize(input.fiscalAuthorityCode()))) {
            throw conflict("RECEIPT_CALLBACK_AUTHORITY_MISMATCH", "票据回调平台与原申请不一致");
        }
        ExecutionContext context = contextProvider.requireCurrent();
        var inbound = messages.receiveInbound(new ExternalMessageService.InboundMessage(
                "FISCAL_" + receipt.fiscalAuthorityCode(), "RECEIPT_RESULT", input.externalMessageBusinessId(),
                receipt.correlationId(), context.organizationId(), context.departmentId(), input.sanitizedPayload()));
        ReceiptResult result = new ReceiptResult(input.outcome(), input.externalReceiptNo(), input.fiscalCode(),
                input.fiscalNumber(), input.verificationCode(), input.controlledObjectReference(), input.issuedAt(),
                input.errorCode(), input.errorMessage(), input.sanitizedPayload());
        switch (input.operation()) {
            case VOID -> transactions.applyVoidResult(receipt.id(), result, required(input.commandCode()), inbound.id(), input.actionReason());
            case RED_FLUSH -> transactions.applyRedFlushResult(receipt.id(), result, required(input.commandCode()), inbound.id(), input.actionReason());
            case ISSUE -> transactions.applyIssueResult(receipt.id(), result, required(input.commandCode()), inbound.id());
        }
        ReceiptView view = transactions.get(receipt.id(), inbound.duplicate());
        messages.markProcessed(inbound.id(), "Receipt", receipt.id(), view.revision());
        return view;
    }

    private void dispatchIssue(Long receiptId, String commandCode) {
        ReceiptInstruction instruction = transactions.instruction(receiptId);
        FiscalReceiptAdapter adapter = adapter(instruction);
        if (adapter == null) { enqueue(instruction, "RECEIPT_ISSUE", commandCode); return; }
        ReceiptResult result;
        try {
            result = adapter.issue(instruction);
        } catch (RuntimeException exception) {
            result = pending(exception);
        }
        transactions.applyIssueResult(receiptId, result, commandCode, null);
    }

    private void dispatchRedFlush(Long receiptId, String commandCode, String reason) {
        ReceiptView value = transactions.get(receiptId, false);
        ReceiptAction instruction = transactions.redFlushInstruction(receiptId, reason);
        FiscalReceiptAdapter adapter = adapters.stream().filter(candidate -> candidate.supports(
                value.fiscalAuthorityCode(), value.receiptType())).findFirst().orElse(null);
        if (adapter == null) {
            enqueueAction(value, instruction, "RECEIPT_RED_FLUSH");
            return;
        }
        ReceiptResult result;
        try { result = adapter.redFlush(instruction); }
        catch (RuntimeException exception) { result = pending(exception); }
        transactions.applyRedFlushResult(receiptId, result, commandCode, null, reason);
    }

    private FiscalReceiptAdapter adapter(ReceiptInstruction instruction) {
        return adapters.stream().filter(value -> value.supports(
                instruction.fiscalAuthorityCode(), instruction.receiptType())).findFirst().orElse(null);
    }

    private void enqueue(ReceiptInstruction instruction, String messageType, String businessMessageId) {
        ExecutionContext context = contextProvider.requireCurrent();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("receiptId", instruction.receiptId()); payload.put("settlementId", instruction.settlementId());
        payload.put("receiptRequestNo", instruction.receiptRequestNo()); payload.put("idempotencyKey", instruction.idempotencyKey());
        payload.put("receiptType", instruction.receiptType()); payload.put("issueChannel", instruction.issueChannel());
        payload.put("fiscalAuthorityCode", instruction.fiscalAuthorityCode()); payload.put("amount", instruction.amount());
        payload.put("payerName", instruction.payerName()); payload.put("payerIdentityDigest", instruction.payerIdentityDigest());
        payload.put("currencyCode", instruction.currencyCode()); payload.put("insuranceAmount", instruction.insuranceAmount());
        payload.put("personalAccountAmount", instruction.personalAccountAmount()); payload.put("patientAmount", instruction.patientAmount());
        payload.put("lines", instruction.lines());
        var message = messages.enqueueOutbound(new ExternalMessageService.OutboundMessage(
                "FISCAL_" + instruction.fiscalAuthorityCode(), messageType, businessMessageId,
                instruction.correlationId(), context.organizationId(), context.departmentId(), payload,
                "Receipt", instruction.receiptId(), 0L));
        transactions.recordQueued(instruction.receiptId(), message.id());
    }

    private void enqueueQuery(ReceiptInstruction instruction, String businessMessageId) {
        ExecutionContext context = contextProvider.requireCurrent();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("receiptId", instruction.receiptId()); payload.put("receiptRequestNo", instruction.receiptRequestNo());
        payload.put("externalReceiptNo", instruction.externalReceiptNo());
        var message = messages.enqueueOutbound(new ExternalMessageService.OutboundMessage(
                "FISCAL_" + instruction.fiscalAuthorityCode(), "RECEIPT_QUERY", businessMessageId,
                instruction.correlationId(), context.organizationId(), context.departmentId(), payload,
                "Receipt", instruction.receiptId(), 0L));
        transactions.recordQueued(instruction.receiptId(), message.id());
    }

    private void enqueueAction(ReceiptView receipt, ReceiptAction instruction, String messageType) {
        ExecutionContext context = contextProvider.requireCurrent();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("receiptId", instruction.receiptId()); payload.put("receiptRequestNo", instruction.receiptRequestNo());
        payload.put("idempotencyKey", instruction.idempotencyKey()); payload.put("externalReceiptNo", instruction.externalReceiptNo());
        payload.put("reason", instruction.reason());
        var message = messages.enqueueOutbound(new ExternalMessageService.OutboundMessage(
                "FISCAL_" + receipt.fiscalAuthorityCode(), messageType, instruction.idempotencyKey(),
                instruction.correlationId(), context.organizationId(), context.departmentId(), payload,
                "Receipt", receipt.id(), receipt.revision()));
        transactions.recordQueued(receipt.id(), message.id());
    }

    private ReceiptResult pending(RuntimeException exception) {
        return new ReceiptResult(ReceiptResult.Outcome.PENDING, null, null, null, null, null,
                null, "FISCAL_CHANNEL_UNCERTAIN", message(exception), null);
    }

    private String required(String value) {
        if (value == null || value.isBlank() || value.trim().length() > 128) {
            throw com.rhn.shared.api.BusinessErrors.badRequest(
                    "RECEIPT_EVENT_COMMAND_REQUIRED", "票据操作必须提供不超过 128 字符的幂等编码");
        }
        return value.trim();
    }

    private String operationCommand(String prefix, String value) {
        return CommandCodes.prefixed(prefix, required(value));
    }

    private String normalize(String value) { return value == null ? null : value.trim().toUpperCase(); }

    private String message(RuntimeException exception) {
        return exception.getMessage() == null || exception.getMessage().isBlank()
                ? "财政票据平台状态暂时未知" : exception.getMessage();
    }

    public record IssueReceiptCommand(Long settlementId, String idempotencyKey, String receiptType,
                                      String issueChannel, String fiscalAuthorityCode, String payerName,
                                      String payerIdentityDigest, String correlationId) {}
    public record RecoveryResult(Long receiptId, String status, boolean accepted,
                                 String errorCode, String errorMessage) {}
}
