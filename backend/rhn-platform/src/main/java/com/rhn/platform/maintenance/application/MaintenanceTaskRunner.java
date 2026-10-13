package com.rhn.platform.maintenance.application;

import com.rhn.platform.maintenance.api.MaintenanceExecutionScope;
import com.rhn.platform.maintenance.api.MaintenanceModels.*;
import com.rhn.platform.maintenance.api.MaintenanceParticipant;
import com.rhn.platform.maintenance.infrastructure.MaintenanceBarrierStore;
import com.rhn.platform.maintenance.infrastructure.MaintenanceStore;
import com.rhn.platform.maintenance.infrastructure.StoredMaintenancePlan;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import static com.rhn.shared.api.BusinessErrors.conflict;

/** Separate transactions make each durable phase recoverable without replaying committed database changes. */
@Service
public class MaintenanceTaskRunner {
    private final MaintenanceStore store;
    private final MaintenanceBarrierStore barrier;
    private final MaintenanceAccess access;
    private final MaintenanceRegistry registry;
    private final MaintenanceEnvironmentPolicy environment;

    public MaintenanceTaskRunner(MaintenanceStore store, MaintenanceBarrierStore barrier,
                                 MaintenanceAccess access, MaintenanceRegistry registry, MaintenanceEnvironmentPolicy environment) {
        this.store = store; this.barrier = barrier; this.access = access; this.registry = registry; this.environment=environment;
    }

    @Transactional
    public void prepare(Long tenant, Long id) {
        store.lockTask(tenant, id);
        TaskView task = store.task(tenant, id);
        if (task.status() != TaskStatus.QUEUED) return;
        var plan = store.plan(tenant, task.planId());
        if (!plan.expiresAt().isAfter(Instant.now())) throw conflict("MAINTENANCE_PLAN_EXPIRED", "维护预览已过期");
        access.reauthorize(store.planData(tenant, task.planId()).actor(), task.scope());
        if (!barrier.freeze(tenant, id)) return;
        transition(task, TaskStatus.PREPARING, null, null, "PREPARE", "已阻断新的业务写入，等待在途事务完成");
    }

    @Transactional
    public void snapshot(Long tenant, Long id) {
        store.lockTask(tenant, id);
        TaskView task = store.task(tenant, id);
        if (task.status() != TaskStatus.PREPARING || !barrier.drained(tenant, id)) return;
        var data = store.planData(tenant, task.planId());
        ExecutionContext actor = access.reauthorize(data.actor(), task.scope());
        var participant = validated(actor, data);
        try (var ignored = MaintenanceExecutionScope.bind(actor)) {
            String backup = participant.backup(actor, task.scope(), data.change());
            if (backup == null || backup.isBlank()) throw conflict("MAINTENANCE_BACKUP_EMPTY", "未取得可恢复的范围数据快照");
            store.saveBackup(tenant, id, backup);
        }
        transition(task, TaskStatus.RUNNING, null, null, "BACKUP", "范围恢复快照已加密保存，开始数据库处理");
    }

    @Transactional
    public void apply(Long tenant, Long id) {
        store.lockTask(tenant, id);
        TaskView task = store.task(tenant, id);
        if (task.status() != TaskStatus.RUNNING || !barrier.drained(tenant, id)) return;
        var data = store.planData(tenant, task.planId());
        ExecutionContext actor = access.reauthorize(data.actor(), task.scope());
        var participant = validated(actor, data);
        if (store.backup(tenant, id).isEmpty()) throw conflict("MAINTENANCE_BACKUP_MISSING", "范围恢复快照缺失");
        try (var ignored = MaintenanceExecutionScope.bind(actor,task.id())) {
            participant.apply(actor, task.scope(), data.change());
            participant.verify(actor, task.scope(), data.change());
        }
        transition(task, TaskStatus.VERIFYING, null, null, "DATABASE_COMMIT", "数据库处理与业务完整性校验通过，等待派生数据刷新");
    }

    @Transactional
    public void finish(Long tenant, Long id) {
        store.lockTask(tenant, id);
        TaskView task = store.task(tenant, id);
        if (task.status() != TaskStatus.VERIFYING || !barrier.drained(tenant, id)) return;
        var data = store.planData(tenant, task.planId());
        ExecutionContext actor = access.reauthorize(data.actor(), task.scope());
        var participant = registry.require(data.datasetCode());
        try (var ignored = MaintenanceExecutionScope.bind(actor,task.id())) {
            participant.afterCommit(actor, task.scope(), data.change());
            participant.verify(actor, task.scope(), data.change());
        }
        transition(task, TaskStatus.SUCCEEDED, null, null, "SUCCESS", "数据与派生结果校验完成，恢复业务写入");
        barrier.thaw(tenant, id);
    }

    @Transactional
    public void fail(Long tenant, Long id, RuntimeException error) {
        store.lockTask(tenant, id);
        TaskView task = store.task(tenant, id);
        if (task.status() == TaskStatus.SUCCEEDED || task.status() == TaskStatus.CANCELLED || task.status() == TaskStatus.FAILED) return;
        boolean committed = task.status() == TaskStatus.VERIFYING;
        String code = committed ? "MAINTENANCE_POST_COMMIT_FAILED"
                : error instanceof BusinessException business ? business.code() : "MAINTENANCE_EXECUTION_FAILED";
        String message = error instanceof BusinessException business ? business.getMessage()
                : "维护步骤失败，请根据任务记录核对后重试";
        transition(task, TaskStatus.FAILED, code, message, "FAIL",
                committed ? "数据库已提交，保留维护阻断；可重试派生数据校验" : "数据库处理未提交，保留恢复快照及失败依据");
        if (!committed) barrier.thaw(tenant, id);
    }

    private MaintenanceParticipant validated(ExecutionContext actor, StoredMaintenancePlan data) {
        environment.requireOperation(data.operation());
        if (data.operation() == Operation.RESET_PRELIVE && !actor.hasAuthority("MAINTENANCE.LIFECYCLE"))
            throw conflict("MAINTENANCE_PERMISSION_REVOKED", "上线前重置权限已撤销");
        var participant = registry.require(data.datasetCode());
        if (!participant.dataset().ruleVersion().equals(data.ruleVersion()))
            throw conflict("MAINTENANCE_RULE_CHANGED", "领域维护规则已变化，请重新预览");
        try (var ignored = MaintenanceExecutionScope.bind(actor)) {
            var refreshed = participant.preview(actor, data.scope(), data.operation(), data.modules(), data.roots(), data.inputJson());
            if (!refreshed.blockers().isEmpty() || !refreshed.equals(data.change()))
                throw conflict("MAINTENANCE_SOURCE_CHANGED", "业务数据或引用关系已变化，请重新预览");
        }
        return participant;
    }
    private void transition(TaskView task, TaskStatus status, String failureCode, String failureMessage,
                            String action, String detail) {
        store.updateTask(new TaskView(task.id(), task.planId(), task.scope(), task.operation(), task.datasetCode(),
                task.modules(), status, task.actor(), task.createdAt(), Instant.now(), failureCode, failureMessage));
        store.audit(task.scope().tenantId(), task.id(), action, task.actor(), detail);
    }
}
