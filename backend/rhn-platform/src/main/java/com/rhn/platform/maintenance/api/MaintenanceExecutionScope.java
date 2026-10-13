package com.rhn.platform.maintenance.api;

import com.rhn.shared.context.ExecutionContext;
import com.rhn.platform.tenant.TenantContext;
import java.util.Optional;

/** Explicit authenticated actor binding for domain services invoked by the maintenance worker. */
public final class MaintenanceExecutionScope implements AutoCloseable {
    private static final ThreadLocal<ExecutionContext> CURRENT = new ThreadLocal<>();
    private static final ThreadLocal<Long> TASK = new ThreadLocal<>();
    private final ExecutionContext previous;
    private final Long previousTask;
    private final Long previousTenant;

    private MaintenanceExecutionScope(ExecutionContext actor, Long taskId) {
        previous = CURRENT.get(); CURRENT.set(actor);
        previousTenant = TenantContext.currentTenantId().orElse(null);
        TenantContext.set(actor.tenantId());
        previousTask = TASK.get();
        if (taskId == null) TASK.remove(); else TASK.set(taskId);
    }
    public static MaintenanceExecutionScope bind(ExecutionContext actor) {
        return new MaintenanceExecutionScope(java.util.Objects.requireNonNull(actor), TASK.get());
    }
    public static MaintenanceExecutionScope bind(ExecutionContext actor, Long taskId) {
        return new MaintenanceExecutionScope(java.util.Objects.requireNonNull(actor), taskId);
    }
    public static Optional<Long> currentTaskId() { return Optional.ofNullable(TASK.get()); }
    public static Optional<ExecutionContext> current() { return Optional.ofNullable(CURRENT.get()); }
    @Override public void close() {
        if (previous == null) CURRENT.remove(); else CURRENT.set(previous);
        if (previousTask == null) TASK.remove(); else TASK.set(previousTask);
        if (previousTenant == null) TenantContext.clear(); else TenantContext.set(previousTenant);
    }
}
