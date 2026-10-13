package com.rhn.platform.maintenance.application;

import com.rhn.platform.maintenance.api.MaintenanceWriteGuard;
import com.rhn.platform.maintenance.api.MaintenanceExecutionScope;
import com.rhn.platform.maintenance.infrastructure.MaintenanceBarrierStore;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.concurrent.atomic.AtomicBoolean;

@Component
class DatabaseMaintenanceWriteGuard implements MaintenanceWriteGuard {
    private final MaintenanceBarrierStore store;
    private final TransactionTemplate independent;
    private final ThreadLocal<java.util.Set<Long>> admitted = ThreadLocal.withInitial(java.util.HashSet::new);
    DatabaseMaintenanceWriteGuard(MaintenanceBarrierStore store, PlatformTransactionManager transactions) {
        this.store = store; independent = new TransactionTemplate(transactions);
        independent.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }
    @Override public Permit enter(Long tenant) {
        if (admitted.get().contains(tenant)) return () -> {};
        if (MaintenanceExecutionScope.currentTaskId().isPresent()
                && MaintenanceExecutionScope.current().map(actor -> tenant.equals(actor.tenantId())).orElse(false)) return () -> {};
        Long id = independent.execute(status -> store.enter(tenant));
        admitted.get().add(tenant);
        AtomicBoolean released = new AtomicBoolean();
        Runnable release = () -> {
            if (released.compareAndSet(false, true)) {
                try { independent.executeWithoutResult(status -> store.leave(tenant, id)); }
                finally {
                    admitted.get().remove(tenant);
                    if (admitted.get().isEmpty()) admitted.remove();
                }
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) { release.run(); }
            });
            return () -> {};
        }
        return release::run;
    }
}
