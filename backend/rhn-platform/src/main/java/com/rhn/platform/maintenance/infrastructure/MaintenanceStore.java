package com.rhn.platform.maintenance.infrastructure;

import com.rhn.platform.cryptography.api.SecretEncryptionService;
import com.rhn.platform.maintenance.api.MaintenanceModels.*;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import static com.rhn.shared.api.BusinessErrors.*;

/** Durable command identities and append-only audit are not expired by the generic retry cache. */
@Repository
public class MaintenanceStore {
    private final JdbcTemplate jdbc;
    private final JsonCodec json;
    private final SecretEncryptionService encryption;

    public MaintenanceStore(JdbcTemplate jdbc, JsonCodec json, SecretEncryptionService encryption) {
        this.jdbc = jdbc; this.json = json; this.encryption = encryption;
    }

    public Optional<BatchView> batchByCommand(Long tenant, String command, String hash) {
        return command("RHN_SYS_MAINT_BATCH", "ID_MAINT_BATCH", tenant, command, hash, BatchView.class);
    }
    public void saveBatch(BatchView view, String command, String hash) {
        jdbc.update("insert into RHN_SYS_MAINT_BATCH (ID_MAINT_BATCH,ID_TNT,CD_CMD,CD_HASH,DT_CREATED,JSON_VIEW)"
                + " values (?,?,?,?,?,?)", view.id(), view.scope().tenantId(), command, hash, timestamp(view.createdAt()), json.write(view));
        for (Root root : view.roots()) {
            if (jdbc.queryForObject("select count(*) from RHN_SYS_MAINT_ORIGIN where ID_TNT=? and SD_RSRC_TYPE=? and ID_RSRC=?",
                    Long.class, view.scope().tenantId(), root.resourceType(), root.resourceId()) != 0)
                throw conflict("MAINTENANCE_ROOT_ALREADY_TAGGED", "该业务对象已登记测试来源，请使用原批次");
            jdbc.update("insert into RHN_SYS_MAINT_ORIGIN (ID_MAINT_ORIGIN,ID_TNT,ID_ORG,ID_MAINT_BATCH,SD_MODULE,"
                    + "SD_RSRC_TYPE,ID_RSRC,DT_TAGGED) values (?,?,?,?,?,?,?,?)",
                    GlobalIds.next(), view.scope().tenantId(), root.organizationId(), view.id(), root.module(),
                    root.resourceType(), root.resourceId(), timestamp(view.createdAt()));
        }
    }
    public BatchView batch(Long tenant, Long id) {
        return requireView("RHN_SYS_MAINT_BATCH", "ID_MAINT_BATCH", tenant, id, BatchView.class);
    }
    public List<BatchView> batches(Long tenant) {
        return views("RHN_SYS_MAINT_BATCH", tenant, BatchView.class);
    }

    public void savePlan(PlanView view, StoredMaintenancePlan plan) {
        String binding = binding(view.scope().tenantId(), view.id(), "plan");
        jdbc.update("insert into RHN_SYS_MAINT_PLAN (ID_MAINT_PLAN,ID_TNT,DT_CREATED,DT_EXPIRES,CD_HASH,JSON_VIEW,JSON_SEALED)"
                + " values (?,?,?,?,?,?,?)", view.id(), view.scope().tenantId(), timestamp(Instant.now()), timestamp(view.expiresAt()),
                view.fingerprint(), json.write(view), encryption.encrypt(json.write(plan), binding));
    }
    public PlanView plan(Long tenant, Long id) {
        return requireView("RHN_SYS_MAINT_PLAN", "ID_MAINT_PLAN", tenant, id, PlanView.class);
    }
    public StoredMaintenancePlan planData(Long tenant, Long id) {
        String sealed = jdbc.query("select JSON_SEALED from RHN_SYS_MAINT_PLAN where ID_TNT=? and ID_MAINT_PLAN=?",
                (rs, row) -> rs.getString(1), tenant, id).stream().findFirst()
                .orElseThrow(() -> notFound("MAINTENANCE_RESOURCE_NOT_FOUND", "未找到维护计划"));
        return json.read(encryption.decrypt(sealed, binding(tenant, id, "plan")), StoredMaintenancePlan.class);
    }

    public Optional<TaskView> taskByCommand(Long tenant, String command, String hash) {
        return command("RHN_SYS_MAINT_TASK", "ID_MAINT_TASK", tenant, command, hash, TaskView.class);
    }
    public Optional<TaskView> taskByPlan(Long tenant, Long plan) {
        return jdbc.query("select JSON_VIEW from RHN_SYS_MAINT_TASK where ID_TNT=? and ID_MAINT_PLAN=?",
                (rs, row) -> json.read(rs.getString(1), TaskView.class), tenant, plan).stream().findFirst();
    }
    public void lockPlan(Long tenant, Long id) {
        if (jdbc.query("select ID_MAINT_PLAN from RHN_SYS_MAINT_PLAN where ID_TNT=? and ID_MAINT_PLAN=? for update",
                (rs, row) -> rs.getLong(1), tenant, id).isEmpty())
            throw notFound("MAINTENANCE_RESOURCE_NOT_FOUND", "未找到维护计划");
    }
    public void saveTask(TaskView view, String command, String hash) {
        jdbc.update("insert into RHN_SYS_MAINT_TASK (ID_MAINT_TASK,ID_TNT,ID_MAINT_PLAN,CD_CMD,CD_HASH,SD_STATUS,"
                + "DT_CREATED,DT_UPDATED,JSON_VIEW) values (?,?,?,?,?,?,?,?,?)", view.id(), view.scope().tenantId(),
                view.planId(), command, hash, view.status().name(), timestamp(view.createdAt()), timestamp(view.updatedAt()), json.write(view));
    }
    public TaskView task(Long tenant, Long id) {
        return requireView("RHN_SYS_MAINT_TASK", "ID_MAINT_TASK", tenant, id, TaskView.class);
    }
    public List<TaskView> tasks(Long tenant) { return views("RHN_SYS_MAINT_TASK", tenant, TaskView.class); }
    public List<TaskView> pendingTasks() {
        return jdbc.query("select JSON_VIEW from RHN_SYS_MAINT_TASK where SD_STATUS in "
                + "('QUEUED','PREPARING','RUNNING','VERIFYING') order by DT_CREATED fetch first 50 rows only",
                (rs, row) -> json.read(rs.getString(1), TaskView.class));
    }
    public void updateTask(TaskView view) {
        int rows = jdbc.update("update RHN_SYS_MAINT_TASK set SD_STATUS=?, DT_UPDATED=?, JSON_VIEW=?"
                + " where ID_TNT=? and ID_MAINT_TASK=?", view.status().name(), timestamp(view.updatedAt()), json.write(view),
                view.scope().tenantId(), view.id());
        if (rows != 1) throw conflict("MAINTENANCE_TASK_MISSING", "维护任务不存在");
    }
    public boolean lockTask(Long tenant, Long id) {
        return !jdbc.query("select ID_MAINT_TASK from RHN_SYS_MAINT_TASK where ID_TNT=? and ID_MAINT_TASK=? for update",
                (rs, row) -> rs.getLong(1), tenant, id).isEmpty();
    }
    public void saveBackup(Long tenant, Long task, String content) {
        String sealed = encryption.encrypt(content, binding(tenant, task, "backup"));
        jdbc.update("insert into RHN_SYS_MAINT_BACKUP (ID_MAINT_TASK,ID_TNT,DT_CREATED,JSON_SEALED)"
                + " values (?,?,?,?)", task, tenant, timestamp(Instant.now()), sealed);
    }
    public Optional<String> backup(Long tenant, Long task) {
        return jdbc.query("select JSON_SEALED from RHN_SYS_MAINT_BACKUP where ID_TNT=? and ID_MAINT_TASK=?",
                (rs, row) -> encryption.decrypt(rs.getString(1), binding(tenant, task, "backup")),
                tenant, task).stream().findFirst();
    }

    public void audit(Long tenant, Long resource, String action, String actor, String detail) {
        jdbc.update("insert into RHN_SYS_MAINT_AUDIT (ID_MAINT_AUDIT,ID_TNT,ID_RSRC,CD_ACTION,NA_ACTOR,DT_CREATED,DES_DETAIL)"
                + " values (?,?,?,?,?,?,?)", GlobalIds.next(), tenant, resource, action, actor, timestamp(Instant.now()), detail);
    }
    public List<AuditView> audits(Long tenant, Long resource) {
        return jdbc.query("select * from RHN_SYS_MAINT_AUDIT where ID_TNT=? and ID_RSRC=? order by ID_MAINT_AUDIT",
                (rs, row) -> new AuditView(rs.getLong("ID_MAINT_AUDIT"), rs.getLong("ID_RSRC"),
                        rs.getString("CD_ACTION"), rs.getString("NA_ACTOR"),
                        rs.getObject("DT_CREATED", java.time.OffsetDateTime.class).toInstant(), rs.getString("DES_DETAIL")),
                tenant, resource);
    }

    private <T> Optional<T> command(String table, String idColumn, Long tenant, String command, String hash, Class<T> type) {
        var rows = jdbc.query("select CD_HASH,JSON_VIEW from " + table + " where ID_TNT=? and CD_CMD=?",
                (rs, row) -> new String[]{rs.getString(1), rs.getString(2)}, tenant, command);
        if (rows.isEmpty()) return Optional.empty();
        if (!hash.equals(rows.getFirst()[0])) throw conflict("MAINTENANCE_COMMAND_REUSED", "请求编码已用于不同的维护请求");
        return Optional.of(json.read(rows.getFirst()[1], type));
    }
    private <T> T requireView(String table, String idColumn, Long tenant, Long id, Class<T> type) {
        return jdbc.query("select JSON_VIEW from " + table + " where ID_TNT=? and " + idColumn + "=?",
                (rs, row) -> json.read(rs.getString(1), type), tenant, id).stream().findFirst()
                .orElseThrow(() -> notFound("MAINTENANCE_RESOURCE_NOT_FOUND", "未找到维护资源"));
    }
    private <T> List<T> views(String table, Long tenant, Class<T> type) {
        return jdbc.query("select JSON_VIEW from " + table + " where ID_TNT=? order by DT_CREATED desc fetch first 50 rows only",
                (rs, row) -> json.read(rs.getString(1), type), tenant);
    }
    private java.time.OffsetDateTime timestamp(Instant value) { return value.atOffset(java.time.ZoneOffset.UTC); }
    private String binding(Long tenant, Long resource, String kind) { return "maintenance/" + tenant + "/" + kind + "/" + resource; }
}
