package com.rhn.diagnostics.application;

import com.rhn.outpatient.api.OrderDocumentExecutionDirectory;
import com.rhn.diagnostics.infrastructure.DiagnosticExecutionTaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
class DiagnosticDocumentService implements OrderDocumentExecutionDirectory {
    private final DiagnosticExecutionTaskRepository tasks;
    DiagnosticDocumentService(DiagnosticExecutionTaskRepository tasks) { this.tasks = tasks; }
    @Override @Transactional(readOnly = true)
    public boolean isAmendable(Long tenantId, Long requestId) {
        return tasks.findByTenantIdAndRequestId(tenantId, requestId)
                .map(task -> "WAITING_SETTLEMENT".equals(task.status()) || "READY".equals(task.status()))
                .orElse(true);
    }
    @Override @Transactional
    public void requireAmendable(Long tenantId, Long requestId) {
        tasks.lockByTenantIdAndRequestId(tenantId, requestId).ifPresent(task -> {
            if (!"WAITING_SETTLEMENT".equals(task.status()) && !"READY".equals(task.status())) {
                throw conflict("ORDER_DOCUMENT_EXECUTION_STARTED", "申请单已采集、执行或关闭，不能直接修改单据信息");
            }
        });
    }
}
