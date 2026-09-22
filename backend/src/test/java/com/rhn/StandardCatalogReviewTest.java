package com.rhn;

import com.rhn.platform.masterdata.api.StandardCatalogReview.*;
import com.rhn.platform.masterdata.application.StandardCatalogReviewService;
import com.rhn.platform.masterdata.application.MedicationStandardService;
import com.rhn.platform.masterdata.application.ClinicalSemanticVersions;
import com.rhn.platform.masterdata.infrastructure.StandardCatalogReviewStore;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.MediaType;
import java.time.Instant;
import java.util.Set;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class StandardCatalogReviewTest extends RhnIntegrationTestSupport {
    @MockitoBean ExecutionContextProvider contexts;
    @Autowired StandardCatalogReviewService reviews;
    @Autowired MedicationStandardService standards;
    @Autowired StandardCatalogReviewStore store;
    @Autowired JsonCodec codec;
    @Autowired com.rhn.platform.masterdata.application.MedicationSemanticsService semantics;
    @Autowired com.rhn.platform.masterdata.api.CatalogLifecycleDirectory catalog;
    private static final String PATH = "/api/platform/master-data/medication-standard-catalog/source-review";
    private final Long tenant = Long.valueOf(TENANT);
    private final Evidence evidence = new Evidence("测试目录来源", "测试发布机构", "测试版 2026", "归档文档 TEST-1 第 2 页", "测试材料，核对目录版本与来源文件；不作为真实临床证据");

    @BeforeEach void actor() { actor(7L, tenant, true); }
    void actor(Long id, Long tenantId, boolean manage) {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenantId, id, "reviewer-" + id, "review-test",
                manage ? Set.of("MASTER_DATA.MANAGE") : Set.of(), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT),
                "DEPARTMENT", Set.of(), Set.of()));
    }
    View action(String action, int revision) { return reviews.change(new Change(reviews.identity(), revision, action,
            "SUBMIT".equals(action) ? evidence : null, "测试操作理由")); }

    @Test void distinct_reviewers_verify_exact_source_and_revocation_preserves_frozen_reference() throws Exception {
        var linked = linkStandardMedication("STD-9405B86DD5B404C44E1B92B5", "MED-2026-W006-04");
        assertThat(reviews.view().status()).isEqualTo("UNVERIFIED");
        var submitted = action("SUBMIT", 0);
        assertThat(submitted.allowedActions()).isEmpty();
        assertThatThrownBy(() -> action("VERIFY", 1)).isInstanceOf(BusinessException.class).hasMessageContaining("提交人不能");
        actor(8L, tenant, true);
        assertThat(reviews.view().allowedActions()).containsExactly("VERIFY", "REJECT");
        var approved = action("VERIFY", 1);
        assertThat(approved.status()).isEqualTo("VERIFIED");
        var frozen = standards.reference(tenant, linked.path("id").asLong());
        assertThat(frozen.sourceVerificationStatus()).isEqualTo("VERIFIED");
        assertThat(frozen.sourceVerificationId()).isEqualTo(approved.latest().id().toString());
        var captured = semantics.freeze(tenant, catalog.requireMedication(tenant, linked.path("id").asLong()), null, null, null,
                java.math.BigDecimal.ONE, "粒", java.math.BigDecimal.ONE, "D", java.time.LocalDate.now());
        assertThat(captured.at("/clinicalSemantics/standardReference/sourceVerificationId").asString()).isEqualTo(frozen.sourceVerificationId());
        mockMvc.perform(get("/api/platform/master-data/clinical-semantics/readiness").with(rhnWorkContext())
                .param("query", linked.path("code").asString()).param("filter", "SOURCE_UNVERIFIED"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        var revoked = action("REVOKE", 2);
        assertThat(revoked.history()).extracting(Event::status).containsExactly("REVOKED", "VERIFIED", "SUBMITTED");
        assertThat(standards.reference(tenant, linked.path("id").asLong()).sourceVerificationStatus()).isEqualTo("REVOKED");
        assertThat(frozen.sourceVerificationStatus()).isEqualTo("VERIFIED");
        assertThat(revoked.history().get(1).id().toString()).isEqualTo(frozen.sourceVerificationId());
        assertThat(captured.at("/clinicalSemantics/standardReference/sourceVerificationStatus").asString()).isEqualTo("VERIFIED");
        assertThat(semantics.medicationHistory(linked.path("id").asLong())).anySatisfy(version -> {
            var saved = codec.readTree(version.snapshot());
            assertThat(saved.at("/standardReference/sourceVerificationId").asString()).isEqualTo(frozen.sourceVerificationId());
        });
    }

    @Test void rejected_material_can_be_resubmitted_without_rewriting_prior_evidence() {
        action("SUBMIT", 0); actor(8L, tenant, true);
        assertThatThrownBy(() -> reviews.change(new Change(reviews.identity(), 1, "VERIFY", evidence, "替换材料")))
                .hasMessageContaining("不能修改");
        action("REJECT", 1); actor(7L, tenant, true);
        var corrected = new Evidence("修订的测试目录", evidence.publisher(), evidence.edition(), "档案 TEST-2 第 3 页", "更正测试材料");
        var result = reviews.change(new Change(reviews.identity(), 2, "SUBMIT", corrected, "补充证据"));
        assertThat(result.latest().evidence()).isEqualTo(corrected);
        assertThat(result.history().getLast().evidence()).isEqualTo(evidence);
        assertThat(result.revision()).isEqualTo(3);
    }

    @Test void tenant_and_exact_edition_isolation_prevent_inheriting_another_approval() {
        action("SUBMIT", 0); actor(8L, tenant, true); action("VERIFY", 1);
        actor(8L, 999999L, true);
        assertThat(reviews.view().history()).isEmpty();
        assertThat(reviews.summary(999999L).path("source").path("verificationStatus").asString()).isEqualTo("UNVERIFIED");
        var id = reviews.identity();
        for (var wrong : new Identity[]{new Identity(id.catalogId(), id.catalogVersion(), "different", id.sourceHash()),
                new Identity(id.catalogId(), id.catalogVersion(), id.contentHash(), "different-source")}) {
            assertThatThrownBy(() -> reviews.change(new Change(wrong, 0, "SUBMIT", evidence, "不匹配")))
                    .hasMessageContaining("版本已变化");
        }
        assertThat(reviews.view().totalEvents()).isZero();
    }

    @Test void absent_permission_missing_evidence_and_stale_revision_never_create_events() {
        actor(7L, tenant, false);
        assertThat(reviews.view().allowedActions()).isEmpty();
        assertThatThrownBy(() -> action("SUBMIT", 0)).hasMessageContaining("权限");
        actor(7L, tenant, true);
        assertThatThrownBy(() -> reviews.change(new Change(reviews.identity(), null, "SUBMIT", evidence, "缺少版本")))
                .hasMessageContaining("当前版本");
        assertThatThrownBy(() -> reviews.change(new Change(reviews.identity(), 0, "SUBMIT", new Evidence("目录", "", "2026", "位置", "说明"), "理由")))
                .hasMessageContaining("完整填写");
        assertThat(reviews.view().totalEvents()).isZero();
        action("SUBMIT", 0); actor(8L, tenant, true);
        assertThatThrownBy(() -> action("VERIFY", 0)).hasMessageContaining("刷新");
        assertThatThrownBy(() -> reviews.change(new Change(reviews.identity(), 1, "VERIFY", null, " "))).hasMessageContaining("完整填写");
        assertThat(reviews.view().totalEvents()).isEqualTo(1);
    }

    @Test void database_revision_uniqueness_and_history_pagination_preserve_all_editions() {
        var first = action("SUBMIT", 0).latest();
        var duplicate = new Event(GlobalIds.next(), 1, first.identity(), "VERIFIED", evidence, 7L, "submitter", 8L, "reviewer", "竞争写入", Instant.now());
        assertThatThrownBy(() -> store.append(tenant, ClinicalSemanticVersions.hash(first.identity(), codec), duplicate))
                .isInstanceOf(DuplicateKeyException.class);
        var id = reviews.identity();
        var old = new Identity(id.catalogId(), "old-edition", "old-content", "old-source");
        String oldKey = ClinicalSemanticVersions.hash(old, codec);
        for (int revision = 1; revision <= 23; revision++) store.append(tenant, oldKey,
                new Event(GlobalIds.next(), revision, old, "VERIFIED", evidence, 7L, "test", 8L, "test", "历史记录", Instant.now()));
        var view = reviews.view();
        assertThat(view.status()).isEqualTo("SUBMITTED"); // Older-edition approval does not approve this edition.
        assertThat(view.totalEvents()).isEqualTo(24);
        assertThat(view.history()).hasSize(20);
        assertThat(reviews.view(1).history()).hasSize(4).contains(first);
        assertThatThrownBy(() -> reviews.view(-1)).hasMessageContaining("页码");
    }

    @Test void http_contract_requires_edition_and_updates_tenant_summary_without_mutating_source_file() throws Exception {
        mockMvc.perform(post(PATH).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(codec.write(new Change(reviews.identity(), 0, "SUBMIT", evidence, "提交测试材料"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUBMITTED"));
        mockMvc.perform(get(PATH).with(rhnWorkContext())).andExpect(status().isOk())
                .andExpect(jsonPath("$.latest.evidence.location").value(evidence.location()));
        mockMvc.perform(get("/api/platform/master-data/medication-standard-catalog/summary").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.source.verificationStatus").value("SUBMITTED"))
                .andExpect(jsonPath("$.source.suppliedVerificationStatus").value("UNVERIFIED"));
        mockMvc.perform(get(PATH).header("X-Tenant-Id", TENANT)).andExpect(status().isUnauthorized());
    }
}
