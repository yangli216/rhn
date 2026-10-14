package com.rhn;

import com.rhn.platform.identityaccess.api.*;
import com.rhn.platform.maintenance.api.*;
import com.rhn.platform.maintenance.api.MaintenanceModels.*;
import com.rhn.platform.maintenance.application.*;
import com.rhn.platform.maintenance.infrastructure.MaintenanceStore;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import com.rhn.platform.eventing.api.IdempotentDomainEventConsumer;
import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.infrastructure.OutboxEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.util.*;
import java.time.Instant;
import tools.jackson.databind.JsonNode;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ResetDatabaseBeforeEachTestMethod
class MaintenanceClinicalCleanupTest extends RhnIntegrationTestSupport {
    static final Long TENANT_ID = Long.valueOf(TENANT), ORG_ID = Long.valueOf(ORGANIZATION), ACTOR_ID = 362387869790222L;
    static final Set<String> GRANTS = Set.of("MAINTENANCE.VIEW", "MAINTENANCE.MANAGE", "MAINTENANCE.EXECUTE", "MAINTENANCE.LIFECYCLE", "MAINTENANCE.BACKUP",
            "MASTER_DATA.MANAGE", "CONFIGURATION.ACCESS", "OUTPATIENT.ACCESS", "RESIDENT.ACCESS", "PHARMACY.ACCESS",
            "BILLING.ACCESS", "CLINICAL_DOCUMENT.ACCESS", "ROLE_ADMIN", "PORTAL.ACCESS");
    @MockitoBean ExecutionContextProvider contexts;
    @MockitoBean IdentityAccessDirectory accounts;
    @MockitoBean WorkContextDirectory workContexts;
    @Autowired MaintenancePlanningService planning;
    @Autowired MaintenanceLifecycleService lifecycle;
    @Autowired MaintenanceTaskService tasks;
    @Autowired MaintenanceTaskRunner runner;
    @Autowired MaintenanceStore store;
    @Autowired MaintenanceRootDirectory roots;
    @Autowired MaintenanceTestDataDirectory origins;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonCodec codec;
    @Autowired IdempotentDomainEventConsumer consumer;
    @Autowired OutboxEventRepository outbox;
    @Autowired com.rhn.billing.application.BillingApplicationService billing;
    @Autowired com.rhn.pharmacy.application.InventoryLedgerPostingService stockLedger;
    private static final String MEDICATION_ID = "362387869795203";
    private static final String PRODUCT_ID = "362387869795113";
    private static final String PACKAGE_ID = "362387869795403";
    Long patient;
    @BeforeEach void actor() throws Exception {
        Long practitioner = jdbc.queryForObject("select ID_PRACT from RHN_SYS_USER_ACCT where ID_USER=?", Long.class, ACTOR_ID);
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(TENANT_ID, ACTOR_ID, "doctor", "cleanup-test", GRANTS,
                ORG_ID, Long.valueOf(DEPARTMENT), "ORGANIZATION", Set.of(ORG_ID), Set.of(Long.valueOf(DEPARTMENT)), practitioner));
        when(accounts.requireAccount(TENANT_ID, ACTOR_ID)).thenReturn(new UserAccountReference(ACTOR_ID, TENANT_ID, practitioner, "doctor", "ACTIVE"));
        when(accounts.findActiveAccount(TENANT_ID, "doctor")).thenReturn(Optional.of(
                new AuthenticatedAccount(ACTOR_ID, TENANT_ID, practitioner, "doctor", "unused", GRANTS)));
        when(workContexts.authoritiesFor(TENANT_ID, ACTOR_ID, ORG_ID, Long.valueOf(DEPARTMENT))).thenReturn(GRANTS);
        jdbc.update("delete from RHN_SYS_MAINT_WRITE");
        jdbc.update("delete from RHN_SYS_MAINT_STATE");
        String body = "{\"fullName\":\"维护功能测试患者\",\"gender\":\"1\",\"birthDate\":\"1988-06-18\","
                + "\"identifiers\":[{\"system\":\"9\",\"value\":\"" + GlobalIds.next() + "\",\"useType\":\"SECONDARY\"}]}";
        String response = mockMvc.perform(post("/api/residents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        patient = Long.valueOf(json(response).get("id").asString());
    }
    @Test void clears_a_real_created_encounter_and_its_owned_facts_but_keeps_patient_and_peer_encounter() throws Exception {
        Long target = encounter();
        mockMvc.perform(verifiedEncounterStart(target.toString())).andExpect(status().isOk());
        mockMvc.perform(post("/api/outpatient-flow/{id}/terminate", target).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"commandCode\":\"term-" + GlobalIds.next() + "\",\"terminationCode\":\"PATIENT_LEFT\",\"reason\":\"测试结束\"}"))
                .andExpect(status().isOk());
        Long peer = encounter();
        long patientCount = jdbc.queryForObject("select count(*) from RHN_PI_PAT where ID_TNT=?", Long.class, TENANT_ID);
        BatchView batch = batch(target);
        PlanView plan = preview(batch, Set.of("OUTPATIENT", "BILLING", "PHARMACY"));
        assertThat(plan.blockers()).as("clinical cleanup blockers").isEmpty();
        TaskView task = execute(plan);
        runner.prepare(TENANT_ID, task.id()); runner.snapshot(TENANT_ID, task.id());
        assertThat(store.backup(TENANT_ID, task.id())).isPresent();
        runner.apply(TENANT_ID, task.id()); runner.finish(TENANT_ID, task.id());
        assertThat(store.task(TENANT_ID, task.id()).status()).isEqualTo(TaskStatus.SUCCEEDED);
        assertThat(jdbc.queryForObject("select count(*) from RHN_VIS_ENC where ID_ENC=?", Long.class, target)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from RHN_VIS_ENC where ID_ENC=?", Long.class, peer)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from RHN_PI_PAT where ID_TNT=?", Long.class, TENANT_ID)).isEqualTo(patientCount);
        assertThat(origins.origin(TENANT_ID, "ENCOUNTER", target)).isPresent();
    }
    @Test void registration_requires_explicit_confirmation_and_cannot_reassign_an_existing_origin() throws Exception {
        Long target = encounter();
        assertThatThrownBy(() -> planning.registerBatch(new BatchRequest(scope(), "未确认", "待核对", "missing-confirm-" + GlobalIds.next(),
                "CLINICAL_TEST", List.of(root(target)), false))).hasMessageContaining("明确核对");
        BatchView batch = batch(target);
        assertThatThrownBy(() -> batch(target)).hasMessageContaining("原批次");
        assertThat(origins.origin(TENANT_ID, "ENCOUNTER", target)).get().extracting(MaintenanceTestDataDirectory.TestOrigin::batchId)
                .isEqualTo(batch.id());
    }
    @Test void candidates_report_the_durable_test_origin_and_respect_current_scope() throws Exception {
        Long target = encounter();
        BatchView batch = batch(target);
        var choices = roots.candidates(contexts.requireCurrent(), new Scope(TENANT_ID, false, List.of(ORG_ID)), "");
        assertThat(choices.stream().filter(choice -> choice.resourceId().equals(target)).findFirst()).get()
                .extracting(MaintenanceRootDirectory.RootCandidate::testBatchId).isEqualTo(batch.id());
    }
    @Test void changed_business_facts_require_a_new_preview_before_snapshot() throws Exception {
        Long target = encounter();
        PlanView plan = preview(batch(target), Set.of("OUTPATIENT", "BILLING", "PHARMACY"));
        assertThat(plan.blockers()).isEmpty();
        TaskView task = execute(plan);
        runner.prepare(TENANT_ID, task.id());
        jdbc.update("update RHN_VIS_ENC set REVISION=REVISION+1 where ID_ENC=?", target);
        assertThatThrownBy(() -> runner.snapshot(TENANT_ID, task.id())).hasMessageContaining("已变化");
        assertThat(store.backup(TENANT_ID, task.id())).isEmpty();
    }
    @Test void retired_business_events_cannot_rebuild_cleared_data_even_with_a_new_event_identity() throws Exception {
        Long target = encounter();
        DomainEventEnvelope original = outbox.findByAggregateIdOrderByRecordedAt(target).getFirst().envelope(codec);
        PlanView plan = preview(batch(target), Set.of("OUTPATIENT", "BILLING", "PHARMACY"));
        assertThat(plan.blockers()).isEmpty();
        TaskView task = execute(plan);
        runner.prepare(TENANT_ID, task.id()); runner.snapshot(TENANT_ID, task.id());
        runner.apply(TENANT_ID, task.id()); runner.finish(TENANT_ID, task.id());
        assertThat(jdbc.queryForObject("select SD_PUBLCN_STATUS from RHN_INT_OUTBOX_EVT where ID_EVT=?",
                String.class, original.eventId())).isEqualTo("DISCARDED");
        var executed = new java.util.concurrent.atomic.AtomicBoolean();
        assertThat(consumer.consume("cleanup-replay", original, () -> executed.set(true))).isFalse();
        DomainEventEnvelope reissued = new DomainEventEnvelope(GlobalIds.next(), original.tenantId(), original.organizationId(),
                original.eventType(), original.eventVersion(), original.aggregateType(), original.aggregateId(),
                original.aggregateVersion(), original.subjectId(), original.occurredAt(), original.recordedAt(),
                original.actor(), original.source(), original.correlationId(), original.causationId(),
                original.payload(), original.schemaVersion());
        assertThat(consumer.consume("cleanup-reissued", reissued, () -> executed.set(true))).isFalse();
        assertThat(executed).isFalse();
    }
    @Test void prelive_reset_requires_explicit_state_and_cannot_run_after_go_live() throws Exception {
        encounter();
        var reset = new PreviewRequest(scope(), Operation.RESET_PRELIVE, "CLINICAL_TEST", Set.of("OUTPATIENT","BILLING","PHARMACY"),
                null, "{\"noRealEffectsConfirmed\":true}", "上线前演练重置");
        assertThatThrownBy(() -> planning.preview(reset)).hasMessageContaining("上线前状态");
        String name = jdbc.queryForObject("select NA_ORG from RHN_SYS_ORG where ID_ORG=?", String.class, ORG_ID);
        lifecycle.transition(new LifecycleRequest(scope(), Lifecycle.PRELIVE, name, "已核对上线前测试用途", true));
        var plan = planning.preview(reset);
        assertThat(plan.blockers()).isEmpty();
        var task = execute(plan);
        lifecycle.transition(new LifecycleRequest(scope(), Lifecycle.LIVE, name, "正式上线", false));
        assertThatThrownBy(() -> lifecycle.transition(new LifecycleRequest(scope(), Lifecycle.PRELIVE, name, "尝试回退", true)))
                .hasMessageContaining("不能回退");
        runner.prepare(TENANT_ID,task.id());
        assertThatThrownBy(() -> runner.snapshot(TENANT_ID,task.id())).hasMessageContaining("上线前状态");
        assertThat(store.backup(TENANT_ID,task.id())).isEmpty();
    }
    @Test void downloaded_recovery_snapshot_is_scoped_and_access_is_audited() throws Exception {
        var plan = preview(batch(encounter()), Set.of("OUTPATIENT","BILLING","PHARMACY"));
        var task = execute(plan); runner.prepare(TENANT_ID, task.id()); runner.snapshot(TENANT_ID,task.id());
        var body = codec.readObject(new String(tasks.backupExport(task.id()), java.nio.charset.StandardCharsets.UTF_8));
        assertThat(body.get("format")).isEqualTo("RHN_MAINTENANCE_BACKUP_V1");
        assertThat(body.get("snapshotSha256")).isNotNull();
        assertThat(store.audits(TENANT_ID,task.id())).extracting(AuditView::action).contains("EXPORT_BACKUP");
        var previous = contexts.requireCurrent();
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(TENANT_ID, ACTOR_ID, "doctor", "test", Set.of("MAINTENANCE.VIEW"),
                ORG_ID, Long.valueOf(DEPARTMENT), "ORGANIZATION", Set.of(ORG_ID), Set.of(Long.valueOf(DEPARTMENT)), previous.practitionerId()));
        assertThatThrownBy(() -> tasks.backupExport(task.id())).hasMessageContaining("权限");
    }
    private Long encounter() throws Exception {
        String response = mockMvc.perform(post("/api/encounters").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"residentId\":\"" + patient + "\",\"organizationId\":\"" + ORGANIZATION
                                + "\",\"departmentId\":\"" + DEPARTMENT + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return Long.valueOf(json(response).get("id").asString());
    }
    @Test void pharmacy_freeze_cleanup_releases_only_the_selected_prescription_and_keeps_stock_configuration() throws Exception {
        var fixture = prescription();
        long active = jdbc.queryForObject("select count(*) from RHN_SUP_RX_INV_FREEZE where ID_RX=? and SD_STATUS='ACTIVE'",
                Long.class, fixture.prescriptionId());
        assertThat(active).isPositive();
        java.math.BigDecimal onHand = jdbc.queryForObject("select QTY_ON_HAND from RHN_SUP_INV_BAL where ID_STOCK_ITEM=?",
                java.math.BigDecimal.class, fixture.itemId());
        var source = batch(fixture.encounterId());
        var incomplete = preview(source, Set.of("OUTPATIENT"));
        assertThat(incomplete.blockers()).isNotEmpty();
        var complete = preview(source, Set.of("OUTPATIENT", "BILLING", "PHARMACY"));
        assertThat(complete.blockers()).isEmpty();
        finish(complete);
        assertThat(jdbc.queryForObject("select QTY_FROZEN from RHN_SUP_INV_BAL where ID_STOCK_ITEM=?",
                java.math.BigDecimal.class, fixture.itemId())).isEqualByComparingTo("0");
        assertThat(jdbc.queryForObject("select QTY_ON_HAND from RHN_SUP_INV_BAL where ID_STOCK_ITEM=?",
                java.math.BigDecimal.class, fixture.itemId())).isEqualByComparingTo(onHand);
        assertThat(jdbc.queryForObject("select count(*) from RHN_SUP_STOCK_ITEM where ID_STOCK_ITEM=?", Long.class, fixture.itemId())).isEqualTo(1);
    }
    @Test void cash_charges_invoice_payment_and_account_are_cleared_as_one_test_family() throws Exception {
        var fixture = prescription();
        dispense(fixture);
        try (var binding = MaintenanceExecutionScope.bind(contexts.requireCurrent())) {
        billing.synchronizeMedicationCharges(fixture.encounterId(),
                new com.rhn.billing.application.BillingApplicationService.SynchronizeCommand("charges-" + GlobalIds.next()));
        var statement = billing.encounterStatement(fixture.encounterId(), "CNY");
        var invoice = billing.issueInvoice(statement.accountId(),
                new com.rhn.billing.application.BillingApplicationService.IssueInvoiceCommand(
                        "invoice-" + GlobalIds.next(), java.time.Instant.now(), "OUTPATIENT", "CASHIER", null));
        var payment = billing.collectPayment(invoice.id(),
                new com.rhn.billing.application.BillingApplicationService.PaymentCommand(
                        "cash-" + GlobalIds.next(), "CASH", "CASHIER", invoice.netAmount(), java.time.Instant.now(),
                        null, "经核对的测试收款；未收取真实现金", null));
        var plan = preview(batch(fixture.encounterId()), Set.of("OUTPATIENT", "BILLING", "PHARMACY"));
        assertThat(plan.blockers()).isEmpty();
        finish(plan);
        assertThat(jdbc.queryForObject("select count(*) from RHN_BIL_PAY where ID_PAY=?", Long.class, payment.id())).isZero();
        assertThat(jdbc.queryForObject("select count(*) from RHN_BIL_INVOICE where ID_INVOICE=?", Long.class, invoice.id())).isZero();
        assertThat(jdbc.queryForObject("select count(*) from RHN_BIL_PAT_ACCT where ID_PAT_ACCT=?", Long.class, statement.accountId())).isZero();
        assertThat(jdbc.queryForObject("select QTY_ON_HAND from RHN_SUP_INV_BAL where ID_STOCK_ITEM=?", java.math.BigDecimal.class,
                fixture.itemId())).isEqualByComparingTo("28");
        assertThat(jdbc.queryForObject("select count(*) from RHN_SUP_INV_TXN where SD_SRC_TYPE='MAINTENANCE_TASK'", Long.class)).isEqualTo(1);
        }
    }
    @Test void a_quarantined_test_return_reverses_both_stock_dimensions_and_keeps_original_ledger_amounts() throws Exception {
        var fixture = prescription();
        var dispensed = dispense(fixture);
        JsonNode original = dispensed.dispense(); Reviewer pharmacist = dispensed.pharmacist();
        mockMvc.perform(post("/api/pharmacy/dispenses/{id}/returns", original.get("id").asString()).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"returnNo":"%s","reasonCode":"PATIENT_NOT_USE","occurredAt":"%s",
                         "processorPractitionerId":"%s","processorAssignmentId":"%s","description":"测试退药，无真实交付",
                         "lines":[{"originalDispenseLineId":"%s","quantity":1,"disposition":"QUARANTINE"}]}
                        """.formatted("test-return-"+GlobalIds.next(), Instant.now(),pharmacist.practitionerId(),pharmacist.assignmentId(),
                                original.at("/lines/0/id").asString()))).andExpect(status().isCreated());
        var before = jdbc.queryForObject("select sum(AMT_DELTA) from RHN_SUP_INV_TXN_LINE where ID_STOCK_ITEM=?", java.math.BigDecimal.class, fixture.itemId());
        var plan = preview(batch(fixture.encounterId()), Set.of("OUTPATIENT","BILLING","PHARMACY"));
        assertThat(plan.blockers()).isEmpty(); finish(plan);
        assertThat(jdbc.queryForObject("select QTY_ON_HAND from RHN_SUP_INV_BAL where ID_STOCK_ITEM=? and SD_STOCK_STATUS='AVAILABLE'",
                java.math.BigDecimal.class, fixture.itemId())).isEqualByComparingTo("28");
        assertThat(jdbc.queryForObject("select QTY_ON_HAND from RHN_SUP_INV_BAL where ID_STOCK_ITEM=? and SD_STOCK_STATUS='QUARANTINE'",
                java.math.BigDecimal.class, fixture.itemId())).isEqualByComparingTo("0");
        assertThat(jdbc.queryForObject("select sum(AMT_DELTA) from RHN_SUP_INV_TXN_LINE where ID_STOCK_ITEM=?", java.math.BigDecimal.class,
                fixture.itemId())).isEqualByComparingTo(before);
    }
    @Test void removing_a_test_quarantine_return_preserves_the_cost_of_unselected_stock() throws Exception {
        var fixture = prescription(); var dispensed = dispense(fixture);
        JsonNode original = dispensed.dispense(); Reviewer pharmacist = dispensed.pharmacist();
        mockMvc.perform(post("/api/pharmacy/dispenses/{id}/returns", original.get("id").asString()).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"returnNo":"%s","reasonCode":"PATIENT_NOT_USE","occurredAt":"%s",
                         "processorPractitionerId":"%s","processorAssignmentId":"%s","description":"测试退药",
                         "lines":[{"originalDispenseLineId":"%s","quantity":1,"disposition":"QUARANTINE"}]}
                        """.formatted("cost-return-"+GlobalIds.next(),Instant.now(),pharmacist.practitionerId(),pharmacist.assignmentId(),
                                original.at("/lines/0/id").asString()))).andExpect(status().isCreated());
        var dimension=jdbc.queryForMap("select ID_STOCK_SITE,ID_STOCK_BIN,ID_STOCK_LOT from RHN_SUP_INV_BAL where ID_STOCK_ITEM=? and SD_STOCK_STATUS='QUARANTINE'",fixture.itemId());
        try (var binding=MaintenanceExecutionScope.bind(contexts.requireCurrent())) {
            var unrelated=stockLedger.postDocument(new com.rhn.pharmacy.application.InventoryApplicationService.DocumentPostingCommand(
                    "unselected-stock-"+GlobalIds.next(),"RETURN","STOCK_TRANSFER","peer-stock-"+GlobalIds.next(),
                    ((Number)dimension.get("ID_STOCK_SITE")).longValue(),Instant.now(),"未纳入清理的其他库存入账",
                    java.util.List.of(new com.rhn.pharmacy.application.InventoryApplicationService.DocumentPostingLineCommand(
                            ((Number)dimension.get("ID_STOCK_BIN")).longValue(),fixture.itemId(),((Number)dimension.get("ID_STOCK_LOT")).longValue(),
                            "QUARANTINE",new java.math.BigDecimal("14"),new java.math.BigDecimal("1.20"),false))));
            assertThat(jdbc.queryForObject("select PRICE_AVERAGE_UNIT_COST from RHN_SUP_INV_BAL where ID_STOCK_ITEM=? and SD_STOCK_STATUS='QUARANTINE'",
                    java.math.BigDecimal.class,fixture.itemId())).isEqualByComparingTo("0.90");
            var plan=preview(batch(fixture.encounterId()),Set.of("OUTPATIENT","BILLING","PHARMACY"));
            assertThat(plan.blockers()).isEmpty(); finish(plan);
            assertThat(jdbc.queryForObject("select QTY_ON_HAND from RHN_SUP_INV_BAL where ID_STOCK_ITEM=? and SD_STOCK_STATUS='QUARANTINE'",
                    java.math.BigDecimal.class,fixture.itemId())).isEqualByComparingTo("14");
            assertThat(jdbc.queryForObject("select PRICE_AVERAGE_UNIT_COST from RHN_SUP_INV_BAL where ID_STOCK_ITEM=? and SD_STOCK_STATUS='QUARANTINE'",
                    java.math.BigDecimal.class,fixture.itemId())).isEqualByComparingTo("1.20");
            assertThat(jdbc.queryForObject("select count(*) from RHN_SUP_INV_TXN where ID_INV_TXN=?",Long.class,unrelated.id())).isEqualTo(1);
        }
    }
    @Test void split_cleanup_restores_only_selected_consumption_and_retains_packaging_history() throws Exception {
        var fixture = prescription(true); dispense(fixture);
        assertThat(jdbc.queryForObject("select QTY_REM_BASE from RHN_SUP_INV_OPEN_PKG where ID_STOCK_ITEM=?", java.math.BigDecimal.class,fixture.itemId()))
                .isEqualByComparingTo("7");
        var plan = preview(batch(fixture.encounterId()),Set.of("OUTPATIENT","BILLING","PHARMACY"));
        assertThat(plan.blockers()).isEmpty(); finish(plan);
        assertThat(jdbc.queryForObject("select QTY_REM_BASE from RHN_SUP_INV_OPEN_PKG where ID_STOCK_ITEM=?", java.math.BigDecimal.class,fixture.itemId()))
                .isEqualByComparingTo("14");
        assertThat(jdbc.queryForObject("select count(*) from RHN_SUP_INV_SPLIT_EVT where SD_SRC_TYPE='MAINTENANCE_TASK'",Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from RHN_SUP_INV_SPLIT_EVT where SD_EVT_TYPE='CONSUME'",Long.class)).isEqualTo(1);
    }
    @Test void whole_tracked_pack_restores_availability_and_points_to_the_real_maintenance_task() throws Exception {
        var fixture=prescription(false,true,1,null); dispense(fixture);
        Long code=jdbc.queryForObject("select ID_INV_TRACE_CODE from RHN_SUP_INV_TRACE_CODE where ID_STOCK_ITEM=? and SD_STATUS='ISSUED'",Long.class,fixture.itemId());
        var plan=preview(batch(fixture.encounterId()),Set.of("OUTPATIENT","BILLING","PHARMACY"));
        assertThat(plan.blockers()).isEmpty(); finish(plan);
        assertThat(jdbc.queryForObject("select SD_STATUS from RHN_SUP_INV_TRACE_CODE where ID_INV_TRACE_CODE=?",String.class,code)).isEqualTo("AVAILABLE");
        assertThat(jdbc.queryForObject("select SD_CURRENT_DOC_TYPE from RHN_SUP_INV_TRACE_CODE where ID_INV_TRACE_CODE=?",String.class,code)).isEqualTo("MAINTENANCE_TASK");
        assertThat(jdbc.queryForObject("select QTY_REM_BASE from RHN_SUP_INV_TRACE_CODE where ID_INV_TRACE_CODE=?",java.math.BigDecimal.class,code)).isEqualByComparingTo("14");
        assertThat(jdbc.queryForObject("select count(*) from RHN_SUP_GOOD_RCPT where ID_STOCK_SITE=?",Long.class,
                jdbc.queryForObject("select ID_STOCK_SITE from RHN_SUP_STOCK_ITEM where ID_STOCK_ITEM=?",Long.class,fixture.itemId()))).isEqualTo(1);
    }
    @Test void tracked_split_restores_package_and_trace_quantities_without_erasing_the_issue_history() throws Exception {
        var fixture=prescription(true,true,7,null); dispense(fixture);
        Long code=jdbc.queryForObject("select ID_INV_TRACE_CODE from RHN_SUP_INV_TRACE_CODE where ID_STOCK_ITEM=? and SD_STATUS='PARTIALLY_ISSUED'",Long.class,fixture.itemId());
        var plan=preview(batch(fixture.encounterId()),Set.of("OUTPATIENT","BILLING","PHARMACY"));
        assertThat(plan.blockers()).isEmpty(); finish(plan);
        assertThat(jdbc.queryForObject("select SD_STATUS from RHN_SUP_INV_TRACE_CODE where ID_INV_TRACE_CODE=?",String.class,code)).isEqualTo("OPENED");
        assertThat(jdbc.queryForObject("select QTY_REM_BASE from RHN_SUP_INV_TRACE_CODE where ID_INV_TRACE_CODE=?",java.math.BigDecimal.class,code)).isEqualByComparingTo("14");
        assertThat(jdbc.queryForObject("select QTY_REM_BASE from RHN_SUP_INV_OPEN_PKG where ID_INV_TRACE_CODE=?",java.math.BigDecimal.class,code)).isEqualByComparingTo("14");
        assertThat(jdbc.queryForObject("select count(*) from RHN_SUP_INV_TRACE_EVT where ID_INV_TRACE_CODE=? and SD_EVT_TYPE='PARTIAL_ISSUE'",Long.class,code)).isEqualTo(1);
    }
    @Test void tracked_quarantine_return_moves_back_to_available_and_keeps_audit_lineage() throws Exception {
        var fixture=prescription(false,true,1,null); var issued=dispense(fixture); returnForTest(issued,1,"QUARANTINE");
        Long code=jdbc.queryForObject("select ID_INV_TRACE_CODE from RHN_SUP_INV_TRACE_CODE where ID_STOCK_ITEM=? and SD_STATUS='QUARANTINED'",Long.class,fixture.itemId());
        var plan=preview(batch(fixture.encounterId()),Set.of("OUTPATIENT","BILLING","PHARMACY"));
        assertThat(plan.blockers()).isEmpty(); var task=finish(plan);
        assertThat(jdbc.queryForObject("select SD_STATUS from RHN_SUP_INV_TRACE_CODE where ID_INV_TRACE_CODE=?",String.class,code)).isEqualTo("AVAILABLE");
        assertThat(jdbc.queryForObject("select ID_CURRENT_DOC from RHN_SUP_INV_TRACE_CODE where ID_INV_TRACE_CODE=?",Long.class,code)).isEqualTo(task.id());
        assertThat(jdbc.queryForObject("select QTY_ON_HAND from RHN_SUP_INV_BAL where ID_STOCK_ITEM=? and SD_STOCK_STATUS='QUARANTINE'",java.math.BigDecimal.class,fixture.itemId()))
                .isEqualByComparingTo("0");
        assertThat(jdbc.queryForObject("select count(*) from RHN_SUP_INV_TRACE_EVT where ID_INV_TRACE_CODE=? and SD_EVT_TYPE='MEDICATION_RETURN'",Long.class,code)).isEqualTo(1);
    }
    @Test void cleanup_of_one_tracked_split_preserves_an_unclassified_peers_consumption_in_the_same_package() throws Exception {
        var selected=prescription(true,true,7,null); dispense(selected);
        String body="{\"fullName\":\"保留业务患者\",\"gender\":\"1\",\"birthDate\":\"1988-06-18\",\"identifiers\":[{\"system\":\"9\",\"value\":\""+GlobalIds.next()+"\",\"useType\":\"SECONDARY\"}]}";
        patient=Long.valueOf(json(mockMvc.perform(post("/api/residents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString());
        var peer=prescription(true,true,3,new PharmacyFixture(selected.itemId().toString())); var issuedPeer=dispense(peer);
        try(var ignored=MaintenanceExecutionScope.bind(contexts.requireCurrent())) {
            billing.synchronizeMedicationCharges(peer.encounterId(),new com.rhn.billing.application.BillingApplicationService.SynchronizeCommand("peer-charges-"+GlobalIds.next()));
        }
        var plan=preview(batch(selected.encounterId()),Set.of("OUTPATIENT","BILLING","PHARMACY"));
        assertThat(plan.blockers()).isEmpty(); finish(plan);
        assertThat(jdbc.queryForObject("select QTY_REM_BASE from RHN_SUP_INV_OPEN_PKG where ID_STOCK_ITEM=?",java.math.BigDecimal.class,selected.itemId())).isEqualByComparingTo("11");
        assertThat(jdbc.queryForObject("select QTY_REM_BASE from RHN_SUP_INV_TRACE_CODE where ID_STOCK_ITEM=? and SD_STATUS='PARTIALLY_ISSUED'",java.math.BigDecimal.class,selected.itemId())).isEqualByComparingTo("11");
        assertThat(jdbc.queryForObject("select QTY_ON_HAND from RHN_SUP_INV_BAL where ID_STOCK_ITEM=?",java.math.BigDecimal.class,selected.itemId())).isEqualByComparingTo("25");
        assertThat(jdbc.queryForObject("select count(*) from RHN_VIS_ENC where ID_ENC=?",Long.class,peer.encounterId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from RHN_SUP_MED_DISP where ID_MED_DISP=?",Long.class,issuedPeer.dispense().get("id").asLong())).isEqualTo(1);
        returnForTest(issuedPeer,3,"RESTOCK");
        assertThat(jdbc.queryForObject("select QTY_REM_BASE from RHN_SUP_INV_OPEN_PKG where ID_STOCK_ITEM=?",java.math.BigDecimal.class,selected.itemId())).isEqualByComparingTo("14");
    }
    @Test void missing_trace_issue_history_blocks_cleanup_instead_of_manufacturing_a_restore() throws Exception {
        var fixture=prescription(false,true,1,null); dispense(fixture); var source=batch(fixture.encounterId());
        jdbc.update("delete from RHN_SUP_INV_TRACE_EVT where SD_EVT_TYPE='ISSUED'");
        var plan=preview(source,Set.of("OUTPATIENT","BILLING","PHARMACY"));
        assertThat(plan.blockers()).extracting(Issue::code).contains("MAINTENANCE_TRACE_HISTORY_MISSING");
        assertThatThrownBy(() -> execute(plan)).hasMessageContaining("阻断");
    }
    @Test void derived_charges_cannot_be_cleared_without_the_encounter_that_can_rebuild_them() throws Exception {
        var fixture=prescription(); dispense(fixture);
        try(var ignored=MaintenanceExecutionScope.bind(contexts.requireCurrent())) {
            billing.synchronizeMedicationCharges(fixture.encounterId(),new com.rhn.billing.application.BillingApplicationService.SynchronizeCommand("derived-"+GlobalIds.next()));
        }
        var plan=preview(batch(fixture.encounterId()),Set.of("BILLING"));
        assertThat(plan.blockers()).extracting(Issue::code).contains("MAINTENANCE_OUTPATIENT_RESET_REQUIRED");
    }
    private void returnForTest(DispenseFixture issued,int quantity,String disposition) throws Exception {
        Reviewer pharmacist=issued.pharmacist();
        mockMvc.perform(post("/api/pharmacy/dispenses/{id}/returns",issued.dispense().get("id").asString()).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"returnNo":"%s","reasonCode":"PATIENT_NOT_USE","occurredAt":"%s",
                         "processorPractitionerId":"%s","processorAssignmentId":"%s","description":"隔离测试退药，无真实交付",
                         "lines":[{"originalDispenseLineId":"%s","quantity":%s,"disposition":"%s"}]}
                        """.formatted("restore-return-"+GlobalIds.next(),Instant.now(),pharmacist.practitionerId(),pharmacist.assignmentId(),
                                issued.dispense().at("/lines/0/id").asString(),quantity,disposition))).andExpect(status().isCreated());
    }
    @Test void scheduled_test_registration_releases_only_its_own_slot_and_keeps_the_peer_booking() throws Exception {
        java.time.LocalDate date=java.time.LocalDate.now().plusDays(1); String suffix=Long.toString(GlobalIds.next());
        JsonNode schedule=json(mockMvc.perform(post("/api/outpatient/scheduling/quick-schedules").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"practitionerId":"362387869790223","catalogItemId":"362387869795104","dateFrom":"%s","dateTo":"%s",
                         "weekdays":[%s],"dayParts":["MORNING"],"morningStart":"08:00","morningEnd":"12:00",
                         "capacity":2,"locationName":"维护验证诊室","idempotencyCode":"schedule-%s"}
                        """.formatted(date,date,date.getDayOfWeek().getValue(),suffix))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String scheduleId=schedule.at("/schedules/0/id").asString();
        JsonNode appointment=json(mockMvc.perform(post("/api/outpatient/appointments").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"residentId\":\"%s\",\"scheduleId\":\"%s\",\"bookingSource\":\"WINDOW\",\"idempotencyCode\":\"book-%s\"}".formatted(patient,scheduleId,suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String peerBody="{\"fullName\":\"保留预约患者\",\"gender\":\"2\",\"birthDate\":\"1988-06-18\",\"identifiers\":[{\"system\":\"9\",\"value\":\""+GlobalIds.next()+"\",\"useType\":\"SECONDARY\"}]}";
        String peer=json(mockMvc.perform(post("/api/residents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(peerBody))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        JsonNode retained=json(mockMvc.perform(post("/api/outpatient/appointments").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"residentId\":\"%s\",\"scheduleId\":\"%s\",\"bookingSource\":\"WINDOW\",\"idempotencyCode\":\"peer-book-%s\"}".formatted(peer,scheduleId,suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        jdbc.update("update RHN_SC_SVC_SCHED set DA_SVC=? where ID_SVC_SCHED=?",java.time.LocalDate.now(),Long.valueOf(scheduleId));
        jdbc.update("update RHN_BD_CATALOG_ITEM set FG_CHGBL=false where ID_CATALOG_ITEM=?",362387869795104L);
        JsonNode registration=json(mockMvc.perform(post("/api/billing/registration-intents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"residentId":"%s","organizationId":"%s","departmentId":"%s","appointmentId":"%s",
                         "idempotencyCode":"reg-%s","registrationSource":"WINDOW","visitType":"GENERAL"}
                        """.formatted(patient,ORGANIZATION,DEPARTMENT,appointment.get("id").asString(),suffix))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        var plan=preview(batch(registration.get("encounterId").asLong()),Set.of("OUTPATIENT","BILLING","PHARMACY"));
        assertThat(plan.blockers()).isEmpty(); finish(plan);
        assertThat(jdbc.queryForObject("select QTY_OCCPD from RHN_SC_SCHED_SLOT_POOL where ID_SVC_SCHED=?",Long.class,Long.valueOf(scheduleId))).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from RHN_SC_APPT where ID_APPT=?",Long.class,retained.get("id").asLong())).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from RHN_SC_SVC_SCHED where ID_SVC_SCHED=?",Long.class,Long.valueOf(scheduleId))).isEqualTo(1);
    }
    @Test void clearing_organization_a_keeps_the_same_patients_encounter_in_organization_b() throws Exception {
        Long target=encounter();
        mockMvc.perform(verifiedEncounterStart(target.toString())).andExpect(status().isOk());
        mockMvc.perform(post("/api/outpatient-flow/{id}/terminate",target).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"commandCode\":\"end-"+GlobalIds.next()+"\",\"terminationCode\":\"PATIENT_LEFT\",\"reason\":\"隔离验证\"}")).andExpect(status().isOk());
        String suffix=Long.toString(GlobalIds.next());
        JsonNode organization=json(mockMvc.perform(post("/api/platform/organizations").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"ORG-B-%s\",\"name\":\"保留业务机构\",\"type\":\"CLINIC\",\"validFrom\":\"2026-01-01\"}".formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        Long org=organization.get("id").asLong();
        JsonNode department=json(mockMvc.perform(post("/api/platform/departments").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"organizationId\":\"%s\",\"code\":\"DEPT-B-%s\",\"name\":\"保留门诊科室\",\"type\":\"OUTPATIENT\",\"validFrom\":\"2026-01-01\"}".formatted(org,suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        Long dept=department.get("id").asLong(); ExecutionContext original=contexts.requireCurrent();
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(TENANT_ID,ACTOR_ID,"doctor","cross-org",GRANTS,ORG_ID,Long.valueOf(DEPARTMENT),
                "ORGANIZATION",Set.of(ORG_ID,org),Set.of(Long.valueOf(DEPARTMENT),dept),original.practitionerId()));
        JsonNode peer=json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"residentId\":\"%s\",\"organizationId\":\"%s\",\"departmentId\":\"%s\"}".formatted(patient,org,dept)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        when(contexts.requireCurrent()).thenReturn(original);
        var plan=preview(batch(target),Set.of("OUTPATIENT","BILLING","PHARMACY"));
        assertThat(plan.blockers()).isEmpty(); finish(plan);
        assertThat(jdbc.queryForObject("select count(*) from RHN_VIS_ENC where ID_ENC=? and ID_ORG=? and ID_PAT=?",Long.class,peer.get("id").asLong(),org,patient)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from RHN_PI_PAT where ID_PAT=?",Long.class,patient)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from RHN_VIS_ENC where ID_ENC=?",Long.class,target)).isZero();
    }
    @Test void prelive_reset_executes_the_complete_scoped_root_set_without_requiring_test_batch_tags() throws Exception {
        Long first=encounter();
        mockMvc.perform(verifiedEncounterStart(first.toString())).andExpect(status().isOk());
        mockMvc.perform(post("/api/outpatient-flow/{id}/terminate",first).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"commandCode\":\"prelive-end-"+GlobalIds.next()+"\",\"terminationCode\":\"PATIENT_LEFT\",\"reason\":\"上线前测试结束\"}")).andExpect(status().isOk());
        Long second=encounter();
        String name=jdbc.queryForObject("select NA_ORG from RHN_SYS_ORG where ID_ORG=?",String.class,ORG_ID);
        lifecycle.transition(new LifecycleRequest(scope(),Lifecycle.PRELIVE,name,"经核对的上线前演练",true));
        var plan=planning.preview(new PreviewRequest(scope(),Operation.RESET_PRELIVE,"CLINICAL_TEST",Set.of("OUTPATIENT","BILLING","PHARMACY"),
                null,"{\"noRealEffectsConfirmed\":true}","完整范围重置"));
        assertThat(plan.blockers()).isEmpty(); finish(plan);
        assertThat(jdbc.queryForObject("select count(*) from RHN_VIS_ENC where ID_ENC in (?,?)",Long.class,first,second)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from RHN_PI_PAT where ID_PAT=?",Long.class,patient)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select SD_LFCYCL from RHN_SYS_MAINT_ORG_STATE where ID_TNT=? and ID_ORG=?",String.class,TENANT_ID,ORG_ID)).isEqualTo("PRELIVE");
    }
    private PrescriptionFixture prescription() throws Exception { return prescription(false); }
    private PrescriptionFixture prescription(boolean split) throws Exception { return prescription(split,false,split ? 7 : 1,null); }
    private PrescriptionFixture prescription(boolean split,boolean tracked,int quantity,PharmacyFixture reuse) throws Exception {
        Long encounter = encounter();
        mockMvc.perform(verifiedEncounterStart(encounter.toString())).andExpect(status().isOk());
        mockMvc.perform(post("/api/residents/{id}/allergies", patient).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"encounterId\":\"" + encounter + "\",\"assertionType\":\"NO_KNOWN_DRUG_ALLERGY\",\"informationSource\":\"PATIENT\"}"))
                .andExpect(status().isCreated());
        saveClinicalRecord(encounter.toString());
        var pharmacy = reuse == null ? createPharmacyWithStock(Long.toString(GlobalIds.next()), 2, split,tracked) : reuse;
        String draft = mockMvc.perform(post("/api/encounters/{id}/prescriptions", encounter).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"categoryCode\":\"WESTERN\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Long prescription = Long.valueOf(json(draft).get("id").asString());
        String request = mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounter).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"prescriptionId":"%s","medicationId":"%s","catalogItemId":%s,"packageId":%s,
                         "quantity":%s,"quantityUnit":"%s","substitutionAllowed":false,"selfProvided":false,
                         "doseValue":5,"doseUnit":"mg","routeCode":"PO","frequencyCode":"QD",
                         "durationValue":%s,"durationUnit":"DAY","allergyReviewConfirmed":true,
                         "priceType":"SALE","pricingRequired":%s,"performerOrganizationId":"%s",
                         "performerDepartmentId":"%s","reason":"测试高血压治疗"}
                        """.formatted(prescription, MEDICATION_ID, "\""+PRODUCT_ID+"\"", split ? "null" : "\""+PACKAGE_ID+"\"", Integer.toString(quantity), split ? "片" : "BOX", split ? Integer.toString(quantity) : "14", !split, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        mockMvc.perform(post("/api/encounters/{enc}/prescriptions/{id}/submit", encounter, prescription).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":0,\"reason\":\"测试提交\"}"))
                .andExpect(status().isOk());
        return new PrescriptionFixture(encounter, prescription, Long.valueOf(pharmacy.stockItemId()),
                Long.valueOf(json(request).get("id").asString()), quantity);
    }
    private TaskView finish(PlanView plan) {
        var task = execute(plan);
        runner.prepare(TENANT_ID, task.id()); runner.snapshot(TENANT_ID, task.id());
        runner.apply(TENANT_ID, task.id()); runner.finish(TENANT_ID, task.id());
        assertThat(store.task(TENANT_ID, task.id()).status()).isEqualTo(TaskStatus.SUCCEEDED);
        return store.task(TENANT_ID,task.id());
    }
    private record PrescriptionFixture(Long encounterId, Long prescriptionId, Long itemId, Long requestId, int dispenseQuantity) {}
    private ScopeRequest scope() { return new ScopeRequest(false, List.of(ORG_ID), false); }
    private Root root(Long target) { return new Root("OUTPATIENT", "ENCOUNTER", target, ORG_ID); }
    private BatchView batch(Long target) {
        return planning.registerBatch(new BatchRequest(scope(), "经核对的临床测试", "隔离测试：没有真实资金或药品交付",
                "clinical-source-" + GlobalIds.next(), "CLINICAL_TEST", List.of(root(target)), true));
    }
    private PlanView preview(BatchView batch, Set<String> modules) {
        return planning.preview(new PreviewRequest(scope(), Operation.CLEAN_TEST, "CLINICAL_TEST", modules,
                batch.id(), "{}", "上线前清理经核对的测试业务"));
    }
    private TaskView execute(PlanView plan) {
        return tasks.execute(plan.id(), new ExecuteRequest(plan.fingerprint(), "clinical-execute-" + GlobalIds.next(),
                jdbc.queryForObject("select NA_ORG from RHN_SYS_ORG where ID_ORG=?", String.class, ORG_ID)));
    }
    private void saveClinicalRecord(String encounterId) throws Exception {
        mockMvc.perform(put("/api/encounters/{encounterId}/clinical-record", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "chiefComplaint":"血压升高伴头晕三天","presentIllness":"无胸痛及意识障碍",
                                  "medicalHistory":"既往高血压","physicalExam":"心肺查体未见明显异常",
                                  "treatmentPlan":"口服降压药并监测血压","systolic":158,"diastolic":96,
                                  "temperature":36.5,"pulseRate":82,
                                  "diagnoses":[{"code":"I10","display":"原发性高血压","type":"PRIMARY"}]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.diagnoses[0].code").value("I10"));
    }

    private PharmacyFixture createPharmacyWithStock(String suffix, int baseQuantity, boolean split,boolean tracked) throws Exception {
        JsonNode site = json(mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","departmentId":"%s",
                                  "code":"OPD-%s","name":"门诊测试药房%s",
                                  "siteType":"PHARMACY","serviceScope":"OUTPATIENT","validFrom":"2026-01-01"
                                }
                                """.formatted(ORGANIZATION, DEPARTMENT, suffix, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());

        JsonNode item = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{siteId}/stock-items", site.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "catalogItemId":%s,"packageId":%s,"issuePolicy":"FEFO",
                                  "negativeAllowed":false,"lotRequired":true,"traceRequired":%s,
                                  "splitAllowed":%s,"coldChain":false,"controlled":false,"highAlert":false
                                }
                                """.formatted(PRODUCT_ID, PACKAGE_ID, tracked, split)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());

        JsonNode bin = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{siteId}/stock-bins", site.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "code":"OPD-PICK-%s","name":"门诊测试发药位","binType":"COUNTER",
                                  "stockDefault":"AVAILABLE","receiveAllowed":true,"pickAllowed":true,
                                  "countAllowed":true,"sortOrder":10
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());

        if (tracked) receiveTracked(site.get("id").asString(),item.get("id").asString(),bin.get("id").asString(),suffix,baseQuantity);
        else {
        JsonNode lot = json(mockMvc.perform(post("/api/pharmacy/stock-items/{stockItemId}/lots", item.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "lotNo":"OPD-%s","productionDate":"2026-01-01","expiryDate":"2027-12-31",
                                  "manufacturerNameSnapshot":"示例制药企业","qualityStatus":"QUALIFIED"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());

        mockMvc.perform(post("/api/pharmacy/inventory/receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "requestCode":"OPD-RCV-%s","sourceCode":"OPENING-%s",
                                  "stockItemId":"%s","stockBinId":"%s","stockLotId":"%s",
                                  "operationQuantity":%d,"unitCost":0.60,"occurredAt":"%s",
                                  "description":"测试入库"
                                }
                                """.formatted(suffix, suffix, item.get("id").asString(), bin.get("id").asString(),
                                lot.get("id").asString(), baseQuantity, Instant.now())))
                .andExpect(status().isCreated());

        }

        mockMvc.perform(post("/api/pharmacy/dispense-routes").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","code":"OPD-ROUTE-%s","name":"门诊发药路由%s",
                                  "careSetting":"OUTPATIENT","sourceDepartmentId":"%s",
                                  "targetStockSiteId":"%s","active":true,"validFrom":"2026-01-01"
                                }
                                """.formatted(ORGANIZATION, suffix, suffix, DEPARTMENT, site.get("id").asString())))
                .andExpect(status().isCreated());

        return new PharmacyFixture(item.get("id").asString());
    }

    private Reviewer createReviewer(String suffix) throws Exception {
        JsonNode practitioner = json(mockMvc.perform(post("/api/platform/practitioners").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"INV-P-%s\",\"fullName\":\"库存药师\",\"sdPractGender\":\"2\"}"
                                .formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode position = json(mockMvc.perform(post("/api/platform/positions").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"INV-POS-%s","name":"库存药师","sdPositionType":"PHARMACY"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode employment = json(mockMvc.perform(post("/api/platform/employments").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "practitionerId":"%s","organizationId":"%s","code":"INV-E-%s",
                                  "sdEmploymentType":"PERMANENT","primaryEmployment":true,"hireDate":"2026-01-01"
                                }
                                """.formatted(practitioner.get("id").asString(), ORGANIZATION, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode assignment = json(mockMvc.perform(post("/api/platform/assignments").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "employmentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "positionId":"%s","code":"INV-A-%s","sdAssignmentType":"PRIMARY",
                                  "primaryAssignment":true,"validFrom":"2026-01-01"
                                }
                                """.formatted(employment.get("id").asString(), ORGANIZATION, DEPARTMENT,
                                position.get("id").asString(), suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return new Reviewer(practitioner.get("id").asString(), assignment.get("id").asString());
    }

    private void receiveTracked(String site,String item,String bin,String suffix,int quantity) throws Exception {
        JsonNode supplier = json(mockMvc.perform(post("/api/pharmacy/suppliers").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"code":"SUP-%s","name":"追溯验证供应商","licenseNo":"LIC-%s","licenseValidTo":"2028-12-31","validFrom":"2026-01-01"}
                        """.formatted(suffix,suffix))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/pharmacy/suppliers/{id}/supply-items",supplier.get("id").asString()).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"catalogItemId":"%s","packageId":"%s","agreementPrice":0.60,"taxRate":0,"validFrom":"2026-01-01"}
                        """.formatted(PRODUCT_ID,PACKAGE_ID))).andExpect(status().isCreated());
        JsonNode order = json(mockMvc.perform(post("/api/pharmacy/purchase-orders").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"stockSiteId":"%s","supplierId":"%s","requestCode":"%s","orderDate":"%s","lines":[
                        {"stockItemId":"%s","packageId":"%s","orderedQuantity":%s,"unitPrice":0.60,"taxRate":0}]}
                        """.formatted(site,supplier.get("id").asString(),"po-"+suffix,java.time.LocalDate.now(),item,PACKAGE_ID,quantity)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String orderId = order.get("id").asString();
        mockMvc.perform(post("/api/pharmacy/purchase-orders/{id}/submit",orderId).with(rhnWorkContext())).andExpect(status().isOk());
        mockMvc.perform(post("/api/pharmacy/purchase-orders/{id}/approve",orderId).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk());
        JsonNode receipt = json(mockMvc.perform(post("/api/pharmacy/goods-receipts").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"purchaseOrderId":"%s","requestCode":"%s","receivedAt":"%s","lines":[
                         {"purchaseOrderLineId":"%s","destinationBinId":"%s","lotNo":"%s","productionDate":"2026-01-01",
                          "expiryDate":"2027-12-31","deliveredQuantity":%s}]}
                        """.formatted(orderId,"receipt-"+suffix,Instant.now(),order.at("/lines/0/id").asString(),bin,"TRACE-LOT-"+suffix,quantity)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String receiptId=receipt.get("id").asString(),line=receipt.at("/lines/0/id").asString();
        mockMvc.perform(post("/api/pharmacy/goods-receipts/{id}/inspect",receiptId).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"lines\":[{\"goodsReceiptLineId\":\"%s\",\"acceptedQuantity\":%s,\"rejectedQuantity\":0}]}".formatted(line,quantity)))
                .andExpect(status().isOk());
        List<String> codes=java.util.stream.IntStream.range(0,quantity).mapToObj(i -> "TRACE-"+suffix+"-"+i).toList();
        mockMvc.perform(post("/api/pharmacy/goods-receipts/{id}/trace-codes",receiptId).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(codec.write(Map.of("lines",List.of(Map.of("goodsReceiptLineId",line,"traceCodes",codes)))))).andExpect(status().isOk());
        mockMvc.perform(post("/api/pharmacy/goods-receipts/{id}/post",receiptId).with(rhnWorkContext())).andExpect(status().isOk());
    }
    private DispenseFixture dispense(PrescriptionFixture fixture) throws Exception {
        Reviewer pharmacist = createReviewer(Long.toString(GlobalIds.next()));
        JsonNode task = json(mockMvc.perform(post("/api/pharmacy/requests/{id}/intake", fixture.requestId()).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("{\"stockItemId\":\"" + fixture.itemId() + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String taskId = task.get("id").asString();
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{id}/reviews", taskId).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"result":"PASS","pharmacistPractitionerId":"%s","reviewerAssignmentId":"%s"}
                        """.formatted(pharmacist.practitionerId(), pharmacist.assignmentId()))).andExpect(status().isOk());
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{id}/reservations", taskId).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("{\"expiryMinutes\":30}")).andExpect(status().isOk());
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{id}/picking/complete", taskId).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"pickerPractitionerId":"%s","pickerAssignmentId":"%s","description":"测试配药"}
                        """.formatted(pharmacist.practitionerId(), pharmacist.assignmentId()))).andExpect(status().isOk());
        JsonNode result = json(mockMvc.perform(post("/api/pharmacy/dispense-tasks/{id}/dispenses", taskId).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"requestCode":"%s","operationQuantity":%s,"occurredAt":"%s",
                         "dispenserPractitionerId":"%s","dispenserAssignmentId":"%s","description":"测试发药，无真实药品交付"}
                        """.formatted("test-disp-"+GlobalIds.next(), fixture.dispenseQuantity(), Instant.now(), pharmacist.practitionerId(), pharmacist.assignmentId())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return new DispenseFixture(result, pharmacist);
    }
    private record DispenseFixture(JsonNode dispense, Reviewer pharmacist) {}
    private record Reviewer(String practitionerId, String assignmentId) {}
    private record PharmacyFixture(String stockItemId) {}

}
