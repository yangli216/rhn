package com.rhn;

import com.rhn.platform.maintenance.infrastructure.MaintenanceBarrierStore;
import com.rhn.platform.maintenance.infrastructure.MaintenanceProcessIdentity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

class MaintenanceBarrierRecoveryTest {
    JdbcTemplate jdbc;
    MaintenanceProcessIdentity process;
    MaintenanceBarrierStore store;
    @BeforeEach void database() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:maint_recovery_"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("create table RHN_SYS_MAINT_STATE (ID_TNT bigint primary key, ID_MAINT_TASK bigint)");
        jdbc.execute("create table RHN_SYS_MAINT_WRITE (ID_MAINT_WRITE bigint primary key,ID_TNT bigint,DT_STARTED timestamp with time zone,CD_NODE varchar(200),ID_PROC bigint,NUM_PROC_START bigint)");
        jdbc.execute("create table RHN_SYS_MAINT_AUDIT (ID_MAINT_AUDIT bigint,ID_TNT bigint,ID_RSRC bigint,CD_ACTION varchar(32),NA_ACTOR varchar(128),DT_CREATED timestamp with time zone,DES_DETAIL varchar(1000))");
        jdbc.update("insert into RHN_SYS_MAINT_STATE values (10,20)");
        process = new MaintenanceProcessIdentity("test-"+UUID.randomUUID()); store = new MaintenanceBarrierStore(jdbc, process);
    }
    @Test void an_old_timestamp_does_not_release_a_live_writer() {
        insert(process.node(), process.pid(), process.started());
        assertThat(store.drained(10L,20L)).isFalse();
        assertThat(jdbc.queryForObject("select count(*) from RHN_SYS_MAINT_AUDIT",Long.class)).isZero();
    }
    @Test void a_terminated_process_is_reaped_and_audited_without_releasing_the_task_barrier() throws Exception {
        Process child = new ProcessBuilder("sleep", "30").start();
        try {
            long started = child.info().startInstant().orElseThrow().toEpochMilli();
            insert(process.node(),child.pid(),started);
            assertThat(store.drained(10L,20L)).isFalse();
            child.destroy(); child.waitFor();
            assertThat(store.drained(10L,20L)).isTrue();
            assertThat(jdbc.queryForObject("select CD_ACTION from RHN_SYS_MAINT_AUDIT",String.class)).isEqualTo("REAP_DEAD_WRITER");
            assertThat(jdbc.queryForObject("select ID_MAINT_TASK from RHN_SYS_MAINT_STATE",Long.class)).isEqualTo(20L);
        } finally { if (child.isAlive()) { child.destroyForcibly(); child.waitFor(); } }
    }
    @Test void another_namespace_or_missing_identity_never_implies_a_dead_process() {
        insert("other-process-namespace", process.pid(),process.started());
        assertThat(store.drained(10L,20L)).isFalse();
        jdbc.update("update RHN_SYS_MAINT_WRITE set CD_NODE=?,NUM_PROC_START=null",process.node());
        assertThat(store.drained(10L,20L)).isFalse();
    }
    @Test void pid_reuse_does_not_keep_a_dead_incarnation_admitted() {
        insert(process.node(),process.pid(),process.started()-1000);
        assertThat(store.drained(10L,20L)).isTrue();
    }
    private void insert(String node,long pid,Long started) {
        jdbc.update("insert into RHN_SYS_MAINT_WRITE values (1,10,?,?,?,?)",Instant.parse("2020-01-01T00:00:00Z").atOffset(ZoneOffset.UTC),node,pid,started);
    }
}
