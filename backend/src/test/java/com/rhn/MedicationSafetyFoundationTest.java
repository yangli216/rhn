package com.rhn;

import com.rhn.outpatient.api.MedicationSafetyDecision;
import com.rhn.outpatient.api.MedicationSafetyPort;
import com.rhn.outpatient.api.PrescriptionSafetyRequest;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.quality.medication.application.MedicationSafetyAdapter;
import com.rhn.quality.medication.application.MedicationSafetyEngine;
import com.rhn.quality.medication.application.PrescriptionSafetyHasher;
import com.rhn.quality.medication.domain.MedicationSafetyEvaluation;
import com.rhn.quality.medication.domain.MedicationSafetyFinding;
import com.rhn.quality.medication.domain.MedicationSafetyOverride;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.quality.medication.infrastructure.MedicationEvaluationStore;
import com.rhn.quality.medication.infrastructure.MedicationRuleRegistry;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;

import static com.rhn.quality.MedicationSafetyFixtures.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MedicationSafetyFoundationTest extends RhnIntegrationTestSupport {
    @MockitoBean ExecutionContextProvider contexts;
    @Autowired MedicationSafetyPort safety;
    @Autowired MedicationEvaluationStore store;
    @Autowired MedicationRuleRegistry registry;
    @Autowired JsonCodec codec;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;

    @BeforeEach
    void context() {
        when(contexts.requireCurrent()).thenReturn(context(1L, 5L, 6L));
    }

    private ExecutionContext context(Long tenant, Long organization, Long department) {
        return new ExecutionContext(tenant, 7L, "test", "qmed-test", Set.of(), organization, department,
                "DEPARTMENT", Set.of(), Set.of());
    }

    @Test
    void snapshot_to_rule_to_persistence_round_trip_records_versions_and_evidence() {
        var input = snapshot(item(11, 90L, "DRAFT"), item(12, 90L, "ACTIVE"));
        var result = safety.evaluate(new PrescriptionSafetyRequest(input));
        assertEquals(MedicationSafetyDecision.Status.WARN, result.decision());
        assertEquals("SHADOW", result.mode());
        assertNotNull(result.evaluationId());
        assertEquals(result, safety.find(2L, result.evaluationId()).orElseThrow());
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_AUD_MED_FINDING where ID_TNT=1 and ID_EVAL=?",
                Integer.class, result.evaluationId()));
        assertEquals(input, codec.read(jdbc.queryForObject("select JSON_INPUT from RHN_AUD_MED_EVAL where ID_EVAL=?",
                String.class, result.evaluationId()), PrescriptionSafetySnapshot.class));
        assertEquals("ENGINEERING_BASELINE", result.findings().getFirst().evidence().getFirst().sourceType());
        assertEquals(1, result.ruleExecutions().getFirst().ruleVersion());
        assertEquals(362387869899102L, jdbc.queryForObject("select ID_RULE_VER from RHN_AUD_MED_FINDING where ID_EVAL=?",
                Long.class, result.evaluationId()));
    }

    @Test
    void pass_still_records_executed_rule_and_missing_data_is_durably_unavailable() {
        var pass = safety.evaluate(new PrescriptionSafetyRequest(snapshot(item(11, 90L, "DRAFT"))));
        assertEquals(MedicationSafetyDecision.Status.PASS, pass.decision());
        assertEquals(7, pass.ruleExecutions().size());
        var missing = safety.evaluate(new PrescriptionSafetyRequest(snapshot(item(11, null, "DRAFT"))));
        assertEquals(MedicationSafetyDecision.Status.UNAVAILABLE, missing.decision());
        assertNotNull(missing.evaluationId());
        assertEquals(missing, safety.find(2L, missing.evaluationId()).orElseThrow());
    }

    @Test
    void tenant_prescription_and_work_scope_cannot_cross_evaluation_boundaries() {
        var request = new PrescriptionSafetyRequest(snapshot(item(11, 90L, "DRAFT")));
        var result = safety.evaluate(request);
        assertTrue(safety.find(999L, result.evaluationId()).isEmpty());
        when(contexts.requireCurrent()).thenReturn(context(99L, 5L, 6L));
        assertTrue(safety.find(2L, result.evaluationId()).isEmpty());
        assertEquals("MEDICATION_SAFETY_TENANT_MISMATCH",
                assertThrows(BusinessException.class, () -> safety.evaluate(request)).code());
        when(contexts.requireCurrent()).thenReturn(context(1L, 99L, 6L));
        assertThrows(BusinessException.class, () -> safety.find(2L, result.evaluationId()));
        assertThrows(BusinessException.class, () -> safety.evaluate(request));
    }

    @Test
    void input_hash_tracks_item_changes_even_when_prescription_revision_does_not_change() {
        var first = item(11, 90L, "DRAFT");
        var second = item(12, 91L, "DRAFT");
        assertEquals(PrescriptionSafetyHasher.hash(snapshot(first, second), codec),
                PrescriptionSafetyHasher.hash(snapshot(second, first), codec));
        var changed = new PrescriptionSafetySnapshot.MedicationItem(first.medicationRequestId(), first.revision(),
                first.medicationId(), first.productId(), first.parentRequestId(), first.status(), first.semanticStatus(),
                BigDecimal.TEN, first.doseUnit(), first.routeId(), first.routeCode(), first.routeExecutionType(),
                first.routeResolutionStatus(), first.frequencyId(), first.frequencyCode(), first.frequencyRuleSnapshot(),
                first.durationValue(), first.durationUnit(), first.medicationSnapshot(), first.itemAttributeSnapshot(),
                first.standardMappingSnapshot());
        assertNotEquals(PrescriptionSafetyHasher.hash(snapshot(first), codec), PrescriptionSafetyHasher.hash(snapshot(changed), codec));
        assertNotEquals(PrescriptionSafetyHasher.hash(snapshot(first, second), codec), PrescriptionSafetyHasher.hash(snapshot(first), codec));
    }

    @Test
    void evaluation_survives_outer_business_transaction_rollback() {
        var result = new TransactionTemplate(transactions).execute(transaction -> {
            var evaluation = safety.evaluate(new PrescriptionSafetyRequest(snapshot(item(11, 90L, "DRAFT"), item(12, 90L, "DRAFT"))));
            transaction.setRollbackOnly();
            return evaluation;
        });
        assertNotNull(result);
        assertNotNull(result.evaluationId());
        assertEquals(result, safety.find(2L, result.evaluationId()).orElseThrow());
    }

    @Test
    void finding_insert_failure_rolls_back_the_whole_evaluation() {
        var valid = registry.load(MedicationSafetyEngine.RULE_SET).getFirst();
        var nonexistent = new RuleVersion(Long.MAX_VALUE, valid.definition(), valid.version(), valid.ruleSetVersion(),
                valid.implementationKey(), valid.status(), valid.severity(), valid.decision(), valid.overridePolicy(),
                valid.effectiveFrom(), valid.effectiveTo(), valid.evidence());
        Long id = GlobalIds.next();
        var finding = new MedicationSafetyFinding(GlobalIds.next(), nonexistent, "test", List.of(11L, 12L), "test");
        var input = snapshot(item(11, 90L, "DRAFT"), item(12, 90L, "DRAFT"));
        var decision = new MedicationSafetyDecision(id, 2L, 0, "test", MedicationSafetyEngine.RULE_SET,
                MedicationSafetyEngine.VERSION, "SHADOW", MedicationSafetyDecision.Status.WARN,
                List.of(finding.snapshot()), List.of(), List.of());
        assertThrows(DataAccessException.class, () -> store.append(new MedicationSafetyEvaluation(id, 7L, input, "test",
                Instant.now(), Instant.now(), decision, List.of(finding))));
        assertTrue(store.find(1L, 2L, id).isEmpty());
    }

    @Test
    void database_failure_returns_unavailable_without_a_phantom_evaluation_id() {
        var broken = mock(MedicationEvaluationStore.class);
        doThrow(new DataAccessResourceFailureException("simulated outage")).when(broken).append(any());
        var adapter = new MedicationSafetyAdapter(contexts, registry, broken, codec);
        var result = adapter.evaluate(new PrescriptionSafetyRequest(snapshot(item(11, 90L, "DRAFT"))));
        assertEquals(MedicationSafetyDecision.Status.UNAVAILABLE, result.decision());
        assertNull(result.evaluationId());
        assertTrue(result.failureCodes().contains("EVALUATION_NOT_PERSISTED"));
    }

    @Test
    void unavailable_catalog_cannot_be_mistaken_for_an_empty_passing_rule_set() {
        var broken = mock(MedicationRuleRegistry.class);
        when(broken.load(anyString())).thenThrow(new DataAccessResourceFailureException("simulated outage"));
        var adapter = new MedicationSafetyAdapter(contexts, broken, store, codec);
        var result = adapter.evaluate(new PrescriptionSafetyRequest(snapshot(item(11, 90L, "DRAFT"))));
        assertEquals(MedicationSafetyDecision.Status.UNAVAILABLE, result.decision());
        assertNotNull(result.evaluationId());
        assertEquals(List.of("RULE_CATALOG_UNAVAILABLE"), result.failureCodes());
    }

    @Test
    void override_storage_enforces_same_tenant_and_same_evaluation_finding() {
        var result = safety.evaluate(new PrescriptionSafetyRequest(snapshot(item(11, 90L, "DRAFT"), item(12, 90L, "DRAFT"))));
        var finding = result.findings().getFirst();
        var override = new MedicationSafetyOverride(GlobalIds.next(), 1L, result.evaluationId(), finding.findingId(),
                7L, "测试关联完整性；不是临床覆盖授权", Instant.now());
        jdbc.update("insert into RHN_AUD_MED_OVERRIDE (ID_OVERRIDE, ID_TNT, ID_EVAL, ID_FINDING, ID_USER_ACTOR, DES_REASON, DT_CREATED) values (?,?,?,?,?,?,?)",
                override.id(), override.tenantId(), override.evaluationId(), override.findingId(), override.actorId(), override.reason(), OffsetDateTime.now());
        assertThrows(DataAccessException.class, () -> jdbc.update("insert into RHN_AUD_MED_OVERRIDE (ID_OVERRIDE, ID_TNT, ID_EVAL, ID_FINDING, ID_USER_ACTOR, DES_REASON, DT_CREATED) values (?,?,?,?,?,?,?)",
                GlobalIds.next(), 99L, result.evaluationId(), finding.findingId(), 7L, "cross tenant", OffsetDateTime.now()));
        var other = safety.evaluate(new PrescriptionSafetyRequest(snapshot(item(11, 91L, "DRAFT"))));
        assertThrows(DataAccessException.class, () -> jdbc.update("insert into RHN_AUD_MED_OVERRIDE (ID_OVERRIDE, ID_TNT, ID_EVAL, ID_FINDING, ID_USER_ACTOR, DES_REASON, DT_CREATED) values (?,?,?,?,?,?,?)",
                GlobalIds.next(), 1L, other.evaluationId(), finding.findingId(), 7L, "wrong evaluation", OffsetDateTime.now()));
        assertThrows(IllegalArgumentException.class, () -> new MedicationSafetyOverride(1L, 1L, 1L, 1L, 1L, "   ", Instant.now()));
    }

    @Test
    void qmed_tables_columns_and_chinese_comments_match_physical_catalog() throws Exception {
        var catalog = codec.readTree(java.nio.file.Files.readString(
                java.nio.file.Path.of("../docs/foundation/rhn-physical-schema-map.json")));
        int checked = 0;
        for (var table : catalog) {
            String name = table.path("physical").asString();
            if (!name.startsWith("RHN_AUD_MED_")) continue;
            checked++;
            assertTrue(name.length() <= 30);
            assertEquals(table.path("comment").asString(), jdbc.queryForObject(
                    "select remarks from information_schema.tables where table_schema=current_schema() and upper(table_name)=?",
                    String.class, name));
            var expected = new java.util.TreeMap<String, String>();
            for (var column : table.path("columns")) expected.put(column.path("physical").asString(), column.path("comment").asString());
            var actual = new java.util.TreeMap<String, String>();
            jdbc.query("select column_name, remarks from information_schema.columns where table_schema=current_schema() and upper(table_name)=?",
                    (org.springframework.jdbc.core.RowCallbackHandler) row -> actual.put(
                            row.getString("column_name").toUpperCase(java.util.Locale.ROOT), row.getString("remarks")), name);
            assertEquals(expected, actual, name);
        }
        assertEquals(7, checked);
    }
}
