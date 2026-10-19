package com.rhn.billing.application;

import com.rhn.billing.api.ReconciliationAdapter;
import com.rhn.billing.api.ReconciliationAdapter.*;
import com.rhn.billing.domain.ReconciliationBatchStatus;
import com.rhn.billing.application.ReconciliationTransactionService.*;
import com.rhn.platform.integration.api.ExternalMessageService;
import com.rhn.shared.context.*;
import org.springframework.stereotype.Service;

import java.time.*;
import java.util.*;

@Service
public class ReconciliationApplicationService {
    private final ReconciliationTransactionService tx;
    private final ReconciliationAdapterRegistry adapters;
    private final boolean externalHandoffEnabled;
    private final ExternalMessageService messages;
    private final ExecutionContextProvider contexts;

    public ReconciliationApplicationService(ReconciliationTransactionService tx, ReconciliationAdapterRegistry adapters,
            ExternalMessageService messages, ExecutionContextProvider contexts, @org.springframework.beans.factory.annotation.Value("${rhn.billing.reconciliation.external-handoff-enabled:false}") boolean externalHandoffEnabled) {
        this.tx = tx;
        this.adapters = adapters;
        this.externalHandoffEnabled = externalHandoffEnabled;
        this.messages = messages;
        this.contexts = contexts;
    }

    public BatchView reconcile(Command in) {
        ReconciliationAdapter adapter = adapters.legacy(in.reconciliationType(), in.sourceCode());
        if(adapter == null && !externalHandoffEnabled) throw com.rhn.shared.api.BusinessErrors.badRequest("RECON_ADAPTER_REQUIRED", "此来源没有已声明对账适配器，且未启用受控外部交接");
        PrepareResult p = tx.prepare(new PrepareCommand(in.commandCode(), in.reconciliationType(), in.sourceCode(),
                in.paymentMethodCode(), in.businessDate(), in.currencyCode()));
        if (p.duplicate() || p.batch().status() != ReconciliationBatchStatus.IMPORTED) return tx.get(p.batch().id());
        if (adapter == null) {
            ExecutionContext c = contexts.requireCurrent();
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("batchId", p.batch().id());
            body.put("sourceCode", p.batch().sourceCode());
            body.put("paymentMethodCode", p.batch().paymentMethodCode());
            body.put("businessDate", p.batch().businessDate());
            body.put("currencyCode", p.batch().currencyCode());
            messages.enqueueOutbound(new ExternalMessageService.OutboundMessage(
                    "RECONCILIATION_" + p.batch().sourceCode(), "RECONCILIATION_FETCH", p.batch().batchNo(),
                    c.correlationId(), c.organizationId(), c.departmentId(), body, "ReconciliationBatch",
                    p.batch().id(), p.batch().revision()));
            return tx.get(p.batch().id());
        }
        try {
            ReconciliationStatement statement = adapter.fetch(new ReconciliationRequest(p.batch().reconciliationType(),
                    p.batch().sourceCode(), contexts.requireCurrent().organizationId(), p.batch().businessDate(),
                    p.batch().currencyCode(), in.commandCode(), contexts.requireCurrent().correlationId()));
            return tx.apply(p.batch().id(), statement);
        } catch (RuntimeException e) {
            tx.fail(p.batch().id());
            throw e;
        }
    }

    public BatchView apply(Long id, ReconciliationStatement statement) { return tx.apply(id, statement); }

    public BatchView resolve(Long itemId, String command, String reason, boolean ignore) {
        return tx.resolve(itemId, new ResolveCommand(command, reason, ignore));
    }

    public BatchView get(Long id) { return tx.get(id); }

    public List<BatchView> list() { return tx.list(); }

    public record Command(String commandCode, String reconciliationType, String sourceCode, String paymentMethodCode,
            LocalDate businessDate, String currencyCode) {}
}
