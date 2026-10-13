package com.rhn;

import com.rhn.platform.maintenance.api.MaintenanceModels.*;
import com.rhn.platform.maintenance.api.MaintenanceParticipant;
import com.rhn.platform.maintenance.api.MaintenanceWriteGuard;
import com.rhn.platform.maintenance.application.MaintenanceTaskRunner;
import com.rhn.platform.maintenance.infrastructure.MaintenanceBarrierStore;
import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.platform.identityaccess.api.AuthenticatedAccount;
import com.rhn.platform.identityaccess.api.WorkContextDirectory;
import com.rhn.platform.maintenance.application.MaintenancePlanningService;
import com.rhn.platform.maintenance.application.MaintenanceTaskService;
import com.rhn.platform.maintenance.infrastructure.MaintenanceStore;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import static com.rhn.shared.api.BusinessErrors.badRequest;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ResetDatabaseBeforeEachTestMethod
@Import(MaintenanceFoundationTest.Fixtures.class)
class MaintenanceFoundationTest extends RhnIntegrationTestSupport {
    private static final Long TENANT_ID = Long.valueOf(TENANT);
    private static final Long ORG_ID = Long.valueOf(ORGANIZATION);
    private static final Set<String> GRANTS = Set.of("MAINTENANCE.VIEW", "MAINTENANCE.MANAGE", "MAINTENANCE.EXECUTE");
    @MockitoBean ExecutionContextProvider contexts;
    @MockitoBean IdentityAccessDirectory accounts;
    @MockitoBean WorkContextDirectory workContexts;
    @Autowired MaintenancePlanningService planning;
    @Autowired MaintenanceTaskService tasks;
    @Autowired MaintenanceStore store;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonCodec codec;
    @Autowired TestParticipant participant;
    @Autowired MaintenanceTaskRunner runner;
    @Autowired MaintenanceWriteGuard writes;
    @Autowired MaintenanceBarrierStore barrier;

    @BeforeEach
    void context() {
        when(contexts.requireCurrent()).thenReturn(actor(GRANTS));
        when(accounts.findActiveAccount(TENANT_ID, "doctor")).thenReturn(java.util.Optional.of(
                new AuthenticatedAccount(362387869790222L, TENANT_ID, null, "doctor", "unused", GRANTS)));
        when(workContexts.authoritiesFor(TENANT_ID, 362387869790222L, ORG_ID, Long.valueOf(DEPARTMENT)))
                .thenReturn(GRANTS);
        participant.blocked = false;
        participant.applyError = false;
        participant.afterCommitError = false;
        participant.applied = 0;
        jdbc.execute("create table if not exists RHN_TEST_MAINT_FACT (ID_FACT bigint primary key,NA_VALUE varchar(200))");
        jdbc.update("delete from RHN_TEST_MAINT_FACT");
        jdbc.update("insert into RHN_TEST_MAINT_FACT (ID_FACT,NA_VALUE) values (42,'sensitive-fixture-value')");
        jdbc.update("delete from RHN_SYS_MAINT_ORIGIN");
        jdbc.update("delete from RHN_SYS_MAINT_WRITE");
        jdbc.update("delete from RHN_SYS_MAINT_STATE");
    }

    @Test
    void register_requires_explicit_source_and_replays_only_the_same_request() {
        BatchView first = batch("foundation-batch-replay");
        assertThat(batch("foundation-batch-replay")).isEqualTo(first);
        assertThat(store.audits(TENANT_ID, first.id())).extracting(AuditView::action).containsExactly("REGISTER_BATCH");
        assertThatThrownBy(() -> planning.registerBatch(new BatchRequest(scope(), "different", "人工核对测试对象",
                "foundation-batch-replay", "TEST_FIXTURE", List.of(root())))).hasMessageContaining("请求编码");
        assertThatThrownBy(() -> planning.registerBatch(new BatchRequest(scope(), "empty", "", "empty",
                "TEST_FIXTURE", List.of(root())))).hasMessageContaining("测试来源核对依据");
    }

    @Test
    void organization_permission_does_not_grant_whole_tenant_maintenance() {
        var request = new PreviewRequest(new ScopeRequest(true, List.of(), false), Operation.INITIALIZE,
                "TEST_FIXTURE", Set.of("OUTPATIENT"), null, "{}", "上线前补齐");
        assertThatThrownBy(() -> planning.preview(request)).hasMessageContaining("独立权限");
    }

    @Test
    void batch_roots_cannot_escape_selected_organization_or_module() {
        Root outside = new Root("OUTPATIENT", "ENCOUNTER", 22L, ORG_ID + 1);
        assertThatThrownBy(() -> planning.registerBatch(new BatchRequest(scope(), "outside", "已核对", "outside",
                "TEST_FIXTURE", List.of(outside)))).hasMessageContaining("所选机构");
        Root unsupported = new Root("INPATIENT", "ENCOUNTER", 22L, ORG_ID);
        assertThatThrownBy(() -> planning.registerBatch(new BatchRequest(scope(), "unsupported", "已核对", "unsupported",
                "TEST_FIXTURE", List.of(unsupported)))).hasMessageContaining("所选机构");
    }

    @Test
    void unknown_datasets_and_cleanup_without_a_test_batch_are_rejected() {
        assertThatThrownBy(() -> planning.preview(new PreviewRequest(scope(), Operation.INITIALIZE, "UNKNOWN",
                Set.of("OUTPATIENT"), null, "{}", "补齐"))).hasMessageContaining("尚未接入");
        assertThatThrownBy(() -> planning.preview(new PreviewRequest(scope(), Operation.CLEAN_TEST, "TEST_FIXTURE",
                Set.of("OUTPATIENT"), null, "{}", "清理"))).hasMessageContaining("明确来源");
    }

    @Test
    void encrypted_plan_keeps_internal_snapshot_out_of_public_api_and_plain_storage() {
        PlanView plan = plan("foundation-sealed");
        String publicJson = codec.write(plan);
        assertThat(publicJson).doesNotContain("sensitive-fixture-value", "payloadJson", "authorities");
        String sealed = jdbc.queryForObject("select JSON_SEALED from RHN_SYS_MAINT_PLAN where ID_MAINT_PLAN=?",
                String.class, plan.id());
        assertThat(sealed).doesNotContain("sensitive-fixture-value");
        assertThat(store.planData(TENANT_ID, plan.id()).change().payloadJson()).contains("sensitive-fixture-value");
        assertThat(plan.impacts()).extracting(Impact::recordCount).containsExactly(3L);
    }

    @Test
    void valid_confirmation_creates_one_durable_task_even_with_a_new_command() {
        PlanView plan = plan("foundation-task");
        TaskView task = execute(plan, "foundation-execute");
        assertThat(execute(plan, "foundation-execute")).isEqualTo(task);
        assertThat(task.status()).isEqualTo(TaskStatus.QUEUED);
        assertThatThrownBy(() -> execute(plan, "foundation-execute-again")).hasMessageContaining("已创建任务");
        assertThat(store.audits(TENANT_ID, task.id())).extracting(AuditView::action).containsExactly("QUEUE");
    }

    @Test
    void mismatched_fingerprints_and_confirmation_do_not_create_tasks() {
        PlanView plan = plan("foundation-invalid");
        assertThatThrownBy(() -> tasks.execute(plan.id(), new ExecuteRequest("wrong", "wrong-hash", orgName())))
                .hasMessageContaining("指纹");
        assertThatThrownBy(() -> tasks.execute(plan.id(), new ExecuteRequest(plan.fingerprint(), "wrong-name", "wrong")))
                .hasMessageContaining("完整");
        assertThat(store.taskByPlan(TENANT_ID, plan.id())).isEmpty();
    }

    @Test
    void blocked_and_expired_previews_cannot_execute() {
        participant.blocked = true;
        PlanView blocked = plan("foundation-blocked");
        assertThat(blocked.executable()).isFalse();
        assertThatThrownBy(() -> execute(blocked, "blocked-execute")).hasMessageContaining("阻断");
        participant.blocked = false;
        PlanView original = plan("foundation-expired");
        PlanView expired = new PlanView(original.id(), original.scope(), original.operation(), original.datasetCode(),
                original.modules(), original.batchId(), original.reason(), original.fingerprint(), Instant.EPOCH,
                original.impacts(), original.blockers(), original.retained());
        jdbc.update("update RHN_SYS_MAINT_PLAN set JSON_VIEW=? where ID_MAINT_PLAN=?", codec.write(expired), original.id());
        assertThatThrownBy(() -> execute(expired, "expired-execute")).hasMessageContaining("过期");
    }

    @Test
    void revoked_execution_permission_is_enforced_after_a_preview() {
        PlanView plan = plan("foundation-revoke");
        when(contexts.requireCurrent()).thenReturn(actor(Set.of("MAINTENANCE.VIEW", "MAINTENANCE.MANAGE")));
        assertThatThrownBy(() -> execute(plan, "revoked-execute")).hasMessageContaining("权限");
        assertThat(store.taskByPlan(TENANT_ID, plan.id())).isEmpty();
    }

    @Test
    void cancellation_is_durable_idempotent_and_audited() {
        PlanView plan = plan("foundation-cancel");
        TaskView queued = execute(plan, "cancel-execute");
        TaskView cancelled = tasks.cancel(queued.id());
        assertThat(cancelled.status()).isEqualTo(TaskStatus.CANCELLED);
        assertThat(tasks.cancel(queued.id())).isEqualTo(cancelled);
        assertThat(store.audits(TENANT_ID, queued.id())).extracting(AuditView::action).containsExactly("QUEUE", "CANCEL");
    }

    @Test
    void resources_are_not_visible_across_tenant_boundaries() {
        PlanView plan = plan("foundation-isolation");
        assertThatThrownBy(() -> store.plan(TENANT_ID + 1, plan.id())).hasMessageContaining("未找到");
        assertThatThrownBy(() -> store.planData(TENANT_ID + 1, plan.id())).hasMessageContaining("未找到");
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(TENANT_ID + 1, 9L, "other",
                "other", GRANTS));
        assertThatThrownBy(() -> planning.plan(plan.id())).hasMessageContaining("未找到");
    }

    @Test
    void administration_http_endpoints_require_the_dedicated_permission() throws Exception {
        mockMvc.perform(get("/api/platform/maintenance/datasets").header("X-Tenant-Id", TENANT)
                .header("X-Client-Session-Id", "maintenance-test").with(user("viewer").authorities(
                        new org.springframework.security.core.authority.SimpleGrantedAuthority("PORTAL.ACCESS"))))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/platform/maintenance/datasets").header("X-Tenant-Id", TENANT)
                .header("X-Client-Session-Id", "maintenance-test").with(user("viewer").authorities(
                        new org.springframework.security.core.authority.SimpleGrantedAuthority("MAINTENANCE.VIEW"))))
                .andExpect(status().isOk());
    }

    @Test
    void worker_waits_for_inflight_writes_and_preserves_backup_before_atomic_cleanup() {
        TaskView task = execute(plan("worker-drain"), "worker-drain-execute");
        try (var permit = writes.enter(TENANT_ID)) {
            runner.prepare(TENANT_ID, task.id());
            assertThatThrownBy(() -> java.util.concurrent.CompletableFuture.runAsync(() -> writes.enter(TENANT_ID)).join())
                    .hasStackTraceContaining("业务维护");
            try (var nested = writes.enter(TENANT_ID)) { assertThat(nested).isNotNull(); }
            runner.snapshot(TENANT_ID, task.id());
            assertThat(store.task(TENANT_ID, task.id()).status()).isEqualTo(TaskStatus.PREPARING);
            assertThat(store.backup(TENANT_ID, task.id())).isEmpty();
        }
        runner.snapshot(TENANT_ID, task.id());
        assertThat(store.backup(TENANT_ID, task.id())).get().asString().contains("sensitive-fixture-value");
        runner.apply(TENANT_ID, task.id());
        assertThat(jdbc.queryForObject("select count(*) from RHN_TEST_MAINT_FACT", Long.class)).isZero();
        runner.finish(TENANT_ID, task.id());
        assertThat(store.task(TENANT_ID, task.id()).status()).isEqualTo(TaskStatus.SUCCEEDED);
        try (var permit = writes.enter(TENANT_ID)) { assertThat(permit).isNotNull(); }
        assertThat(store.audits(TENANT_ID, task.id())).extracting(AuditView::action)
                .containsExactly("QUEUE", "PREPARE", "BACKUP", "DATABASE_COMMIT", "SUCCESS");
    }

    @Test
    void a_new_dispatcher_resumes_persisted_stages_without_repeating_the_database_change() {
        TaskView task=execute(plan("restart-worker"),"restart-worker-execute");
        new com.rhn.platform.maintenance.application.MaintenanceTaskDispatcher(store,runner).dispatch();
        assertThat(store.task(TENANT_ID,task.id()).status()).isEqualTo(TaskStatus.PREPARING);
        new com.rhn.platform.maintenance.application.MaintenanceTaskDispatcher(store,runner).dispatch();
        assertThat(store.backup(TENANT_ID,task.id())).isPresent();
        new com.rhn.platform.maintenance.application.MaintenanceTaskDispatcher(store,runner).dispatch();
        assertThat(store.task(TENANT_ID,task.id()).status()).isEqualTo(TaskStatus.VERIFYING);
        new com.rhn.platform.maintenance.application.MaintenanceTaskDispatcher(store,runner).dispatch();
        new com.rhn.platform.maintenance.application.MaintenanceTaskDispatcher(store,runner).dispatch();
        assertThat(store.task(TENANT_ID,task.id()).status()).isEqualTo(TaskStatus.SUCCEEDED);
        assertThat(participant.applied).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from RHN_TEST_MAINT_FACT",Long.class)).isZero();
        assertThat(store.audits(TENANT_ID,task.id())).extracting(AuditView::action).containsExactly("QUEUE","PREPARE","BACKUP","DATABASE_COMMIT","SUCCESS");
    }

    @Test
    void changed_source_is_rejected_before_any_database_cleanup() {
        TaskView task = execute(plan("worker-stale"), "worker-stale-execute");
        runner.prepare(TENANT_ID, task.id());
        jdbc.update("update RHN_TEST_MAINT_FACT set NA_VALUE='changed' where ID_FACT=42");
        assertThatThrownBy(() -> runner.snapshot(TENANT_ID, task.id())).hasMessageContaining("已变化");
        assertThat(store.backup(TENANT_ID, task.id())).isEmpty();
        assertThat(participant.applied).isZero();
    }

    @Test
    void failed_apply_rolls_back_all_database_changes_and_keeps_the_recovery_snapshot() {
        TaskView task = execute(plan("worker-rollback"), "worker-rollback-execute");
        runner.prepare(TENANT_ID, task.id());
        runner.snapshot(TENANT_ID, task.id());
        participant.applyError = true;
        RuntimeException failure = catchThrowableOfType(() -> runner.apply(TENANT_ID, task.id()), RuntimeException.class);
        assertThat(failure).hasMessageContaining("模拟数据库阶段失败");
        assertThat(jdbc.queryForObject("select count(*) from RHN_TEST_MAINT_FACT", Long.class)).isEqualTo(1);
        runner.fail(TENANT_ID, task.id(), failure);
        assertThat(store.task(TENANT_ID, task.id()).status()).isEqualTo(TaskStatus.FAILED);
        assertThat(store.backup(TENANT_ID, task.id())).isPresent();
        try (var permit = writes.enter(TENANT_ID)) { assertThat(permit).isNotNull(); }
    }

    @Test
    void post_commit_failure_retains_the_barrier_and_retry_does_not_repeat_cleanup() {
        TaskView task = execute(plan("worker-post-commit"), "worker-post-commit-execute");
        runner.prepare(TENANT_ID, task.id());
        runner.snapshot(TENANT_ID, task.id());
        runner.apply(TENANT_ID, task.id());
        participant.afterCommitError = true;
        RuntimeException failure = catchThrowableOfType(() -> runner.finish(TENANT_ID, task.id()), RuntimeException.class);
        runner.fail(TENANT_ID, task.id(), failure);
        assertThat(store.task(TENANT_ID, task.id()).failureCode()).isEqualTo("MAINTENANCE_POST_COMMIT_FAILED");
        assertThatThrownBy(() -> writes.enter(TENANT_ID)).hasMessageContaining("业务维护");
        participant.afterCommitError = false;
        tasks.retryVerification(task.id());
        runner.finish(TENANT_ID, task.id());
        assertThat(participant.applied).isEqualTo(1);
        assertThat(store.task(TENANT_ID, task.id()).status()).isEqualTo(TaskStatus.SUCCEEDED);
    }

    @Test
    void background_execution_rechecks_revocation_without_using_system_authority() {
        TaskView task = execute(plan("worker-revoke"), "worker-revoke-execute");
        when(workContexts.authoritiesFor(TENANT_ID, 362387869790222L, ORG_ID, Long.valueOf(DEPARTMENT)))
                .thenReturn(Set.of("MAINTENANCE.VIEW"));
        assertThatThrownBy(() -> runner.prepare(TENANT_ID, task.id())).hasMessageContaining("撤销");
        assertThat(participant.applied).isZero();
    }

    private ScopeRequest scope() { return new ScopeRequest(false, List.of(ORG_ID), false); }
    private Root root() { return new Root("OUTPATIENT", "ENCOUNTER", 42L, ORG_ID); }
    private BatchView batch(String command) {
        return planning.registerBatch(new BatchRequest(scope(), "联调测试批次", "人工核对：合成测试业务",
                command, "TEST_FIXTURE", List.of(root())));
    }
    private PlanView plan(String command) {
        var marked = jdbc.query("select ID_MAINT_BATCH from RHN_SYS_MAINT_ORIGIN where ID_TNT=? and SD_RSRC_TYPE='ENCOUNTER' and ID_RSRC=42",
                (rs, row) -> rs.getLong(1), TENANT_ID);
        BatchView source = marked.isEmpty() ? batch(command) : store.batch(TENANT_ID, marked.getFirst());
        return planning.preview(new PreviewRequest(scope(), Operation.CLEAN_TEST, "TEST_FIXTURE", Set.of("OUTPATIENT"),
                source.id(), "{}", "上线前清理联调业务"));
    }
    private TaskView execute(PlanView plan, String command) {
        return tasks.execute(plan.id(), new ExecuteRequest(plan.fingerprint(), command, orgName()));
    }
    private String orgName() {
        return jdbc.queryForObject("select NA_ORG from RHN_SYS_ORG where ID_ORG=?", String.class, ORG_ID);
    }
    private ExecutionContext actor(Set<String> grants) {
        return new ExecutionContext(TENANT_ID, 362387869790222L, "doctor", "maintenance-test", grants,
                ORG_ID, Long.valueOf(DEPARTMENT), "ORGANIZATION", Set.of(ORG_ID), Set.of(Long.valueOf(DEPARTMENT)));
    }

    @TestConfiguration
    static class Fixtures {
        @Bean TestParticipant maintenanceTestParticipant(JdbcTemplate jdbc, JsonCodec codec) { return new TestParticipant(jdbc, codec); }
    }
    static class TestParticipant implements MaintenanceParticipant {
        final JdbcTemplate jdbc;
        final JsonCodec codec;
        boolean blocked;
        boolean applyError;
        boolean afterCommitError;
        int applied;
        TestParticipant(JdbcTemplate jdbc, JsonCodec codec) { this.jdbc = jdbc; this.codec = codec; }
        @Override public Dataset dataset() {
            return new Dataset("TEST_FIXTURE", "维护测试数据集", Set.of(Operation.CLEAN_TEST, Operation.INITIALIZE),
                    Set.of("OUTPATIENT"), "1");
        }
        @Override public void validateTestRoots(ExecutionContext actor, Scope scope, List<Root> roots, String evidence) {
            if (roots.stream().anyMatch(root -> root.resourceId() != 42L)) throw badRequest("UNKNOWN_ROOT", "来源未核对");
        }
        @Override public PreparedChange preview(ExecutionContext actor, Scope scope, Operation operation,
                                               Set<String> modules, List<Root> roots, String input) {
            var rows = jdbc.queryForList("select ID_FACT,NA_VALUE from RHN_TEST_MAINT_FACT order by ID_FACT");
            return new PreparedChange(codec.write(java.util.Map.of("rows", rows)),
                    List.of(new Impact("OUTPATIENT", "测试就诊", rows.size(), rows.size() * 3L, "DELETE")),
                    blocked ? List.of(new Issue("REAL_PAYMENT", "存在真实支付", "BILLING")) : List.of(),
                    List.of("患者主档", "机构基础配置"));
        }
        @Override public String backup(ExecutionContext actor, Scope scope, PreparedChange change) { return change.payloadJson(); }
        @Override public void apply(ExecutionContext actor, Scope scope, PreparedChange change) {
            applied++;
            jdbc.update("delete from RHN_TEST_MAINT_FACT where ID_FACT=42");
            if (applyError) throw badRequest("TEST_APPLY_FAILED", "模拟数据库阶段失败");
        }
        @Override public void verify(ExecutionContext actor, Scope scope, PreparedChange change) {
            if (jdbc.queryForObject("select count(*) from RHN_TEST_MAINT_FACT", Long.class) != 0)
                throw badRequest("TEST_VERIFY_FAILED", "业务清理校验失败");
        }
        @Override public void afterCommit(ExecutionContext actor, Scope scope, PreparedChange change) {
            if (afterCommitError) throw badRequest("TEST_AFTER_COMMIT_FAILED", "派生刷新失败");
        }
    }
}
