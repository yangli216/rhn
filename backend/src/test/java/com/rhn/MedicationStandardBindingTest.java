package com.rhn;

import com.rhn.platform.masterdata.application.MedicationStandardBindingService;
import com.rhn.platform.masterdata.application.MedicationStandardBindingService.Bind;
import com.rhn.platform.masterdata.api.StandardCatalogReview.Identity;
import com.rhn.platform.masterdata.infrastructure.ClinicalSemanticHistory;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.Set;
import java.util.concurrent.*;
import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class MedicationStandardBindingTest extends RhnIntegrationTestSupport {
    @Autowired MedicationStandardBindingService bindings;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonCodec codec;
    @Autowired ClinicalSemanticHistory history;
    @Autowired PlatformTransactionManager transactions;
    @MockitoBean ExecutionContextProvider contexts;
    static final Long MED = 362387880000024L;
    static final String SPEC = "STD-9405B86DD5B404C44E1B92B5";
    static final String PATH = "/api/platform/master-data/medications/" + MED + "/standard-binding";
    @BeforeEach void context() { context(Long.valueOf(TENANT), true); }
    void context(Long tenant, boolean manage) {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant, 7L, "standard-admin", "binding-test",
                manage ? Set.of("MASTER_DATA.MANAGE") : Set.of(), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT), "DEPARTMENT", Set.of(), Set.of()));
    }
    Bind input() {
        var preview = bindings.preview(MED);
        return new Bind(preview.medication().revision(), preview.identity(), SPEC, "已按原文核对存量药品身份（测试）", true);
    }
    @Test void binding_preserves_medication_fields_and_records_before_after_provenance() throws Exception {
        var original = jdbc.queryForMap("select * from RHN_BD_MED where ID_MED=?", MED);
        var preview = bindings.preview(MED);
        assertThat(preview.candidates()).filteredOn(c -> c.canBind()).singleElement()
                .satisfies(c -> assertThat(c.specification().path("id").asString()).isEqualTo(SPEC));
        mockMvc.perform(post(PATH).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(codec.write(input())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reference.status").value("LINKED"))
                .andExpect(jsonPath("$.audits[0].snapshot.before.status").value("UNMAPPED"))
                .andExpect(jsonPath("$.audits[0].snapshot.after.specificationId").value(SPEC))
                .andExpect(jsonPath("$.audits[0].snapshot.actor").value("standard-admin"));
        assertThat(jdbc.queryForMap("select * from RHN_BD_MED where ID_MED=?", MED)).isEqualTo(original);
        assertThat(history.history(Long.valueOf(TENANT), "MEDICATION", MED.toString(), 100)).extracting(v ->
                codec.readTree(v.snapshot()).at("/standardReference/status").asString()).contains("UNMAPPED", "LINKED");
        assertThatThrownBy(() -> bindings.bind(MED, input())).hasMessageContaining("不能直接覆盖");
        assertThat(bindings.preview(MED).audits()).hasSize(1);
    }
    @Test void stale_medication_catalog_and_missing_confirmation_are_rejected() {
        var input = input();
        assertThatThrownBy(() -> bindings.bind(MED, new Bind(input.expectedRevision()+1, input.identity(), SPEC, "理由", true)))
                .hasMessageContaining("药品档案已变化");
        var id = input.identity();
        assertThatThrownBy(() -> bindings.bind(MED, new Bind(input.expectedRevision(), new Identity(id.catalogId(), id.catalogVersion(), id.contentHash(), "old-source"), SPEC, "理由", true)))
                .hasMessageContaining("来源文件已变化");
        assertThatThrownBy(() -> bindings.bind(MED, new Bind(input.expectedRevision(), id, SPEC, "理由", false))).hasMessageContaining("请确认");
        assertThatThrownBy(() -> bindings.bind(MED, new Bind(input.expectedRevision(), id, SPEC, " ", true))).hasMessageContaining("核对依据");
        assertThat(bindings.preview(MED).reference().status()).isEqualTo("UNMAPPED");
    }
    @Test void mismatched_strength_and_unrelated_medication_cannot_be_forced_into_a_reference() {
        var input = input();
        jdbc.update("update RHN_BD_MED set QTY_STRENGTH_VAL=0.5 where ID_MED=?", MED);
        assertThat(bindings.preview(MED).candidates()).filteredOn(c -> SPEC.equals(c.specification().path("id").asString()))
                .singleElement().satisfies(c -> {assertThat(c.canBind()).isFalse(); assertThat(c.issues()).contains("STANDARD_REFERENCE_STRENGTH_MISMATCH");});
        assertThatThrownBy(() -> bindings.bind(MED, input)).hasMessageContaining("身份不一致");
        jdbc.update("update RHN_BD_MED set CD_MED='NO-CLUE', NA_MED='没有身份线索', NA_ALIAS=null where ID_MED=?", MED);
        assertThat(bindings.preview(MED).candidates()).isEmpty();
        assertThatThrownBy(() -> bindings.bind(MED, input)).hasMessageContaining("身份不一致");
    }
    @Test void differing_identity_fields_are_reported_individually_without_allowing_a_binding() {
        jdbc.update("update RHN_BD_MED set DOSE_FORM='INJECTION', PREPARATION_UNIT='支' where ID_MED=?", MED);
        assertThat(bindings.preview(MED).candidates()).filteredOn(c -> SPEC.equals(c.specification().path("id").asString()))
                .singleElement().satisfies(candidate -> {
                    assertThat(candidate.canBind()).isFalse();
                    assertThat(candidate.issues()).contains("STANDARD_REFERENCE_FORM_MISMATCH", "STANDARD_REFERENCE_UNIT_MISMATCH")
                            .doesNotContain("STANDARD_REFERENCE_SPEC_MISMATCH");
                });
    }

    @Test void ratio_separator_typography_matches_but_changed_ratio_does_not() {
        var specification = medicationReferences.snapshot().path("specifications").valueStream()
                .filter(spec -> "MED-2026-W016".equals(spec.path("legacyCode").asString())).findFirst().orElseThrow();
        String id = specification.path("id").asString();
        String text = specification.path("specification").asString();
        assertThat(text).contains(":");
        jdbc.update("update RHN_BD_MED set CD_MED='MED-2026-W016-TEST', NA_MED=?, NA_ALIAS=null, DOSE_FORM=?, PREPARATION_SPEC=?, QTY_STRENGTH_VAL=null, STRENGTH_UNIT=null where ID_MED=?",
                specification.path("name").asString(), specification.path("doseForm").asString(), text.replace(":", "∶"), MED);
        assertThat(bindings.preview(MED).candidates()).filteredOn(c -> id.equals(c.specification().path("id").asString()))
                .singleElement().satisfies(c -> assertThat(c.canBind()).isTrue());
        jdbc.update("update RHN_BD_MED set PREPARATION_SPEC=? where ID_MED=?", "999ml∶999g", MED);
        assertThat(bindings.preview(MED).candidates()).noneMatch(c -> c.canBind());
    }

    @Test void a_matching_legacy_fragment_is_not_an_eligible_standard_identity() {
        String incomplete = "STD-E5ECB24E5709FE98BDD02477";
        var specification = medicationReferences.specification(incomplete);
        jdbc.update("update RHN_BD_MED set CD_MED=?, NA_MED=?, NA_ALIAS=null, DOSE_FORM=?, PREPARATION_SPEC=?, PREPARATION_UNIT=?, QTY_STRENGTH_VAL=null, STRENGTH_UNIT=null where ID_MED=?",
                specification.path("legacyCode").asString() + "-TEST", specification.path("name").asString(),
                specification.path("doseForm").asString(), specification.path("specification").asString(), specification.path("presentationUnit").asString(null), MED);
        assertThat(bindings.preview(MED).candidates()).filteredOn(c -> incomplete.equals(c.specification().path("id").asString()))
                .singleElement().satisfies(c -> {assertThat(c.canBind()).isFalse(); assertThat(c.issues()).contains("STANDARD_SPECIFICATION_INCOMPLETE");});
        var identity = medicationReferences.summary();
        medicationSources.saveAndFlush(new com.rhn.platform.masterdata.domain.MedicationStandardSource(Long.valueOf(TENANT), MED,
                identity.path("catalogId").asString(), identity.path("catalogVersion").asString(), specification.path("entryId").asString(), incomplete,
                identity.path("contentHash").asString(), 7L));
        assertThat(bindings.preview(MED).reference().status()).isEqualTo("MISMATCH");
        assertThat(medicationReferences.specificationIdentityIssues(medicationReferences.specification("STD-354530524284FB9E2230256B")))
                .contains("STANDARD_SOURCE_FORM_BLOCK_REQUIRES_REVIEW");
        assertThat(medicationReferences.specificationIdentityIssues(medicationReferences.specification(SPEC))).isEmpty();
    }

    @Test void a_claimed_standard_specification_is_not_duplicated() {
        var input = input(); var catalog = medicationReferences.summary();
        Long other = jdbc.queryForObject("select min(ID_MED) from RHN_BD_MED where ID_TNT=? and ID_MED<>?", Long.class, Long.valueOf(TENANT), MED);
        medicationSources.saveAndFlush(new com.rhn.platform.masterdata.domain.MedicationStandardSource(Long.valueOf(TENANT), other,
                catalog.path("catalogId").asString(), catalog.path("catalogVersion").asString(), "OTHER-ENTRY", SPEC, catalog.path("contentHash").asString(), 7L));
        assertThatThrownBy(() -> bindings.bind(MED, input)).hasMessageContaining("其他药品使用");
        assertThat(bindings.preview(MED).candidates()).noneMatch(c -> c.canBind());
    }
    @Test void authorization_tenant_and_inactive_boundaries_are_checked_on_write() throws Exception {
        var input = input();
        context(Long.valueOf(TENANT), false);
        mockMvc.perform(post(PATH).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(codec.write(input)))
                .andExpect(status().isForbidden());
        context(999999L, true);
        assertThatThrownBy(() -> bindings.preview(MED)).hasMessageContaining("当前租户");
        assertThatThrownBy(() -> bindings.bind(MED, input)).hasMessageContaining("当前租户");
        context(Long.valueOf(TENANT), true);
        jdbc.update("update RHN_BD_MED set SD_STATUS='INACTIVE' where ID_MED=?", MED);
        assertThatThrownBy(() -> bindings.bind(MED, input)).hasMessageContaining("已停用");
    }
    @Test void binding_and_audit_roll_back_together() {
        var input = input();
        new TransactionTemplate(transactions).executeWithoutResult(status -> {bindings.bind(MED, input); status.setRollbackOnly();});
        assertThat(bindings.preview(MED).reference().status()).isEqualTo("UNMAPPED");
        assertThat(bindings.preview(MED).audits()).isEmpty();
    }
    @Test void simultaneous_requests_create_only_one_binding_and_one_audit() throws Exception {
        var input = input(); var ready = new CountDownLatch(2); var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            Callable<String> bind = () -> {ready.countDown(); start.await(); try { return bindings.bind(MED, input).reference().status(); }
                catch (BusinessException conflict) { return conflict.code(); }};
            var a = pool.submit(bind); var b = pool.submit(bind); boolean bothReady = ready.await(5, TimeUnit.SECONDS); start.countDown(); assertThat(bothReady).isTrue();
            assertThat(java.util.List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("LINKED", "STANDARD_BINDING_EXISTS");
        }
        assertThat(bindings.preview(MED).bindings()).hasSize(1);
        assertThat(bindings.preview(MED).audits()).hasSize(1);
    }
}
