package com.rhn.platform.maintenance.application;

import com.rhn.platform.maintenance.api.MaintenanceModels.*;
import com.rhn.platform.maintenance.infrastructure.MaintenanceStore;
import com.rhn.platform.maintenance.infrastructure.MaintenanceBarrierStore;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.id.GlobalIds;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.List;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class MaintenanceTaskService {
    private final MaintenanceAccess access;
    private final MaintenanceStore store;
    private final OrganizationDirectory directory;
    private final MaintenanceBarrierStore barrier;
    private final com.rhn.shared.json.JsonCodec json;

    public MaintenanceTaskService(MaintenanceAccess access, MaintenanceStore store, OrganizationDirectory directory,
                                  MaintenanceBarrierStore barrier, com.rhn.shared.json.JsonCodec json) {
        this.access = access; this.store = store; this.directory = directory; this.barrier = barrier; this.json = json;
    }

    @Transactional
    public TaskView execute(Long planId, ExecuteRequest request) {
        var actor = access.current("MAINTENANCE.EXECUTE");
        String command = MaintenancePlanningService.required(request.requestCode(), "请求编码", 128);
        PlanView plan = store.plan(actor.tenantId(), planId);
        access.requireScope(actor, plan.scope());
        String hash = MaintenanceFingerprint.of(planId + "/" + request.fingerprint());
        var repeated = store.taskByCommand(actor.tenantId(), command, hash);
        if (repeated.isPresent()) return repeated.get();
        store.lockPlan(actor.tenantId(), planId);
        repeated = store.taskByCommand(actor.tenantId(), command, hash);
        if (repeated.isPresent()) return repeated.get();
        if (store.taskByPlan(actor.tenantId(), planId).isPresent())
            throw conflict("MAINTENANCE_PLAN_ALREADY_EXECUTED", "该计划已创建任务，请查看原执行记录");
        if (!plan.fingerprint().equals(request.fingerprint()))
            throw conflict("MAINTENANCE_PLAN_FINGERPRINT_STALE", "预览指纹不匹配，请重新生成预览");
        if (!plan.expiresAt().isAfter(Instant.now()))
            throw conflict("MAINTENANCE_PLAN_EXPIRED", "预览已过期，请重新生成");
        if (!plan.executable()) throw conflict("MAINTENANCE_PLAN_BLOCKED", "请先解决预览阻断项");
        var data = store.planData(actor.tenantId(), planId);
        if (!actor.subjectId().equals(data.actor().subjectId()))
            throw forbidden("MAINTENANCE_PLAN_ACTOR_MISMATCH", "请由预览计划的发起账号执行");
        String expected = plan.scope().wholeTenant() ? directory.requireTenant(actor.tenantId()).name()
                : plan.scope().organizationIds().stream().map(id -> directory.requireOrganization(actor.tenantId(), id).name())
                    .collect(java.util.stream.Collectors.joining("、"));
        if (!expected.equals(request.confirmation()))
            throw badRequest("MAINTENANCE_CONFIRMATION_INVALID", "请输入完整的目标租户或机构名称确认");
        Instant now = Instant.now();
        TaskView task = new TaskView(GlobalIds.next(), plan.id(), plan.scope(), plan.operation(),
                plan.datasetCode(), plan.modules(), TaskStatus.QUEUED, actor.actor(), now, now, null, null);
        store.saveTask(task, command, hash);
        store.audit(actor.tenantId(), task.id(), "QUEUE", actor.actor(), "维护任务已登记，等待执行");
        return task;
    }

    public TaskView task(Long id) {
        var actor = access.current("MAINTENANCE.VIEW");
        var task = store.task(actor.tenantId(), id);
        access.requireScope(actor, task.scope());
        return task;
    }
    public List<TaskView> tasks() {
        var actor = access.current("MAINTENANCE.VIEW");
        return store.tasks(actor.tenantId()).stream().filter(task -> actor.hasAuthority("MAINTENANCE.TENANT")
                || !task.scope().wholeTenant() && task.scope().organizationIds().stream().allMatch(actor::canAccessOrganization)).toList();
    }
    public List<AuditView> audit(Long taskId) {
        TaskView task = task(taskId);
        return store.audits(task.scope().tenantId(), taskId);
    }
    @Transactional
    public byte[] backupExport(Long taskId) {
        var actor = access.current("MAINTENANCE.BACKUP");
        var task = store.task(actor.tenantId(), taskId);
        access.requireScope(actor, task.scope());
        String snapshot = store.backup(actor.tenantId(), taskId)
                .orElseThrow(() -> notFound("MAINTENANCE_BACKUP_NOT_FOUND", "任务尚未生成范围恢复快照"));
        var plan = store.planData(actor.tenantId(), task.planId());
        store.audit(actor.tenantId(), taskId, "EXPORT_BACKUP", actor.actor(), "下载范围恢复快照；按任务和授权范围校验");
        var export = new java.util.LinkedHashMap<String, Object>();
        export.put("format", "RHN_MAINTENANCE_BACKUP_V1"); export.put("tenantId", actor.tenantId());
        export.put("taskId", taskId); export.put("datasetCode", task.datasetCode()); export.put("ruleVersion", plan.ruleVersion());
        export.put("scope", task.scope()); export.put("snapshotSha256", MaintenanceFingerprint.of(snapshot));
        export.put("snapshotJson", snapshot);
        return json.write(export).getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    @Transactional
    public TaskView retryVerification(Long taskId) {
        var actor = access.current("MAINTENANCE.EXECUTE");
        store.lockTask(actor.tenantId(), taskId);
        TaskView task = task(taskId);
        if (task.status() != TaskStatus.FAILED || !"MAINTENANCE_POST_COMMIT_FAILED".equals(task.failureCode()))
            throw conflict("MAINTENANCE_RETRY_NOT_ALLOWED", "仅支持重试已提交任务的派生刷新与校验");
        if (!task.id().equals(barrier.lock(actor.tenantId())))
            throw conflict("MAINTENANCE_BARRIER_LOST", "任务未持有维护阻断，请核对恢复状态");
        TaskView retry = new TaskView(task.id(), task.planId(), task.scope(), task.operation(), task.datasetCode(),
                task.modules(), TaskStatus.VERIFYING, task.actor(), task.createdAt(), Instant.now(), null, null);
        store.updateTask(retry);
        store.audit(actor.tenantId(), task.id(), "RETRY_VERIFICATION", actor.actor(), "重试派生刷新及校验，不重复数据库清理");
        return retry;
    }

    @Transactional
    public TaskView cancel(Long taskId) {
        var actor = access.current("MAINTENANCE.EXECUTE");
        store.lockTask(actor.tenantId(), taskId);
        TaskView task = task(taskId);
        if (task.status() == TaskStatus.CANCELLED) return task;
        if (task.status() != TaskStatus.QUEUED)
            throw conflict("MAINTENANCE_TASK_NOT_CANCELLABLE", "任务已进入执行阶段，不能按未执行任务取消");
        TaskView cancelled = new TaskView(task.id(), task.planId(), task.scope(), task.operation(), task.datasetCode(),
                task.modules(), TaskStatus.CANCELLED, task.actor(), task.createdAt(), Instant.now(), null, null);
        store.updateTask(cancelled);
        store.audit(actor.tenantId(), task.id(), "CANCEL", actor.actor(), "任务在执行前取消");
        return cancelled;
    }
}
