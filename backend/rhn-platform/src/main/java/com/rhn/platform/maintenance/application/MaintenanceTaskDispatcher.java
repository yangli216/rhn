package com.rhn.platform.maintenance.application;

import com.rhn.platform.maintenance.api.MaintenanceModels.TaskStatus;
import com.rhn.platform.maintenance.infrastructure.MaintenanceStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "rhn.maintenance", name = "worker-enabled", havingValue = "true", matchIfMissing = true)
public class MaintenanceTaskDispatcher {
    private static final Logger LOG = LoggerFactory.getLogger(MaintenanceTaskDispatcher.class);
    private final MaintenanceStore store;
    private final MaintenanceTaskRunner runner;
    public MaintenanceTaskDispatcher(MaintenanceStore store, MaintenanceTaskRunner runner) {
        this.store = store; this.runner = runner;
    }
    @Scheduled(fixedDelayString = "${rhn.maintenance.poll-interval-ms:1000}")
    public void dispatch() {
        for (var task : store.pendingTasks()) {
            Long tenant = task.scope().tenantId();
            try {
                if (task.status() == TaskStatus.QUEUED) runner.prepare(tenant, task.id());
                else if (task.status() == TaskStatus.PREPARING) runner.snapshot(tenant, task.id());
                else if (task.status() == TaskStatus.RUNNING) runner.apply(tenant, task.id());
                else if (task.status() == TaskStatus.VERIFYING) runner.finish(tenant, task.id());
            } catch (RuntimeException error) {
                try { runner.fail(tenant, task.id(), error); }
                catch (RuntimeException recordingError) {
                    LOG.error("Unable to record maintenance task failure for task {}", task.id());
                }
            }
        }
    }
}
