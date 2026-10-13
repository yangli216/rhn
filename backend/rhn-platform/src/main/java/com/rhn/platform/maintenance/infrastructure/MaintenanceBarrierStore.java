package com.rhn.platform.maintenance.infrastructure;

import com.rhn.shared.id.GlobalIds;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.time.Instant;
import static com.rhn.shared.api.BusinessErrors.*;

@Repository
public class MaintenanceBarrierStore {
    private final JdbcTemplate jdbc;
    private final MaintenanceProcessIdentity process;
    public MaintenanceBarrierStore(JdbcTemplate jdbc, MaintenanceProcessIdentity process) { this.jdbc = jdbc; this.process=process; }

    /** Caller must use a transaction. A tenant row serializes first-time barrier creation. */
    public Long lock(Long tenant) {
        if (jdbc.queryForObject("select count(*) from RHN_SYS_MAINT_STATE where ID_TNT=?", Long.class, tenant) == 0) {
            if (jdbc.query("select ID_TNT from RHN_SYS_TNT where ID_TNT=? for update",
                    (rs, row) -> rs.getLong(1), tenant).isEmpty())
                throw notFound("MAINTENANCE_TENANT_NOT_FOUND", "未找到租户");
            if (jdbc.queryForObject("select count(*) from RHN_SYS_MAINT_STATE where ID_TNT=?", Long.class, tenant) == 0)
                jdbc.update("insert into RHN_SYS_MAINT_STATE (ID_TNT,ID_MAINT_TASK) values (?,null)", tenant);
        }
        return jdbc.query("select ID_MAINT_TASK from RHN_SYS_MAINT_STATE where ID_TNT=? for update",
                (rs, row) -> (Long) rs.getObject(1, Long.class), tenant).getFirst();
    }
    public Long enter(Long tenant) {
        if (lock(tenant) != null) throw conflict("MAINTENANCE_WRITE_PAUSED", "当前租户正在进行业务维护，请稍后重试");
        Long id = GlobalIds.next();
        jdbc.update("insert into RHN_SYS_MAINT_WRITE (ID_MAINT_WRITE,ID_TNT,DT_STARTED,CD_NODE,ID_PROC,NUM_PROC_START) values (?,?,?,?,?,?)",
                id, tenant, Instant.now().atOffset(java.time.ZoneOffset.UTC), process.node(), process.pid(), process.started());
        return id;
    }
    public void leave(Long tenant, Long id) {
        jdbc.update("delete from RHN_SYS_MAINT_WRITE where ID_TNT=? and ID_MAINT_WRITE=?", tenant, id);
    }
    public boolean freeze(Long tenant, Long task) {
        Long owner = lock(tenant);
        if (owner != null && !owner.equals(task)) return false;
        jdbc.update("update RHN_SYS_MAINT_STATE set ID_MAINT_TASK=? where ID_TNT=?", task, tenant);
        return true;
    }
    public boolean drained(Long tenant, Long task) {
        Long owner = lock(tenant);
        if (!task.equals(owner)) throw conflict("MAINTENANCE_BARRIER_LOST", "维护任务未持有写入隔离状态");
        for (var writer : jdbc.query("select ID_MAINT_WRITE,CD_NODE,ID_PROC,NUM_PROC_START from RHN_SYS_MAINT_WRITE where ID_TNT=? and CD_NODE=?",
                (rs,row) -> new Writer(rs.getLong(1), rs.getString(2), rs.getObject(3,Long.class), rs.getObject(4,Long.class)), tenant, process.node())) {
            if (process.provenDead(writer.node(), writer.pid(), writer.started())) {
                leave(tenant, writer.id());
                jdbc.update("insert into RHN_SYS_MAINT_AUDIT (ID_MAINT_AUDIT,ID_TNT,ID_RSRC,CD_ACTION,NA_ACTOR,DT_CREATED,DES_DETAIL) values (?,?,?,?,?,?,?)",
                        GlobalIds.next(), tenant, task, "REAP_DEAD_WRITER", "maintenance-recovery", Instant.now().atOffset(java.time.ZoneOffset.UTC),
                        "已证明同一进程命名空间的在途写入所属进程结束；凭据 " + writer.id());
            }
        }
        return jdbc.queryForObject("select count(*) from RHN_SYS_MAINT_WRITE where ID_TNT=?", Long.class, tenant) == 0;
    }
    private record Writer(Long id, String node, Long pid, Long started) {}
    public void thaw(Long tenant, Long task) {
        lock(tenant);
        jdbc.update("update RHN_SYS_MAINT_STATE set ID_MAINT_TASK=null where ID_TNT=? and ID_MAINT_TASK=?", tenant, task);
    }
}
