package com.rhn;

import com.rhn.analytics.application.AnalyticsCapabilitiesService;
import com.rhn.analytics.domain.*;
import com.rhn.analytics.infrastructure.*;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AnalyticsFoundationTest extends RhnIntegrationTestSupport {
    @Autowired AnalyticsCatalogVersionRepository catalogs;
    @Autowired AnalysisDraftVersionRepository drafts;
    @Autowired AnalysisRunRepository runs;
    @Autowired AnalysisAuditEventRepository audits;
    @Autowired EntityManager entityManager;
    @Autowired PlatformTransactionManager transactions;
    @Autowired JdbcTemplate jdbc;
    private final Instant now = Instant.parse("2026-02-03T00:00:00Z");

    @Test
    void synthetic_records_round_trip_with_pinned_versions_and_string_ids() {
        new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            var catalog = catalogs.save(new AnalyticsCatalogVersion(101L, "synthetic-outpatient", 1, "{\"synthetic\":true}", now));
            var draft = drafts.save(new AnalysisDraftVersion(101L, GlobalIds.next(), 1, 201L, catalog.id(), "{\"contractVersion\":\"a04-contract-v1\"}", now));
            var second = drafts.save(new AnalysisDraftVersion(101L, draft.draftId(), 2, 201L, catalog.id(), "{\"syntheticRevision\":2}", now));
            var run = runs.save(new AnalysisRun(101L, draft.id(), 201L, now));
            var audit = audits.save(new AnalysisAuditEvent(101L, run.id(), 201L, "SYNTHETIC_CREATED", now));
            entityManager.flush(); entityManager.clear();
            assertEquals("CANDIDATE", catalogs.findByIdAndTenantId(catalog.id(), 101L).orElseThrow().reviewStatus());
            assertEquals(draft.specJson(), drafts.findByIdAndTenantId(draft.id(), 101L).orElseThrow().specJson());
            assertEquals(2, drafts.findByIdAndTenantId(second.id(), 101L).orElseThrow().draftVersion());
            assertEquals(draft.id(), runs.findByIdAndTenantId(run.id(), 101L).orElseThrow().draftVersionId());
            assertEquals("QUEUED", runs.findByIdAndTenantId(run.id(), 101L).orElseThrow().state());
            assertEquals("UNAVAILABLE", runs.findByIdAndTenantId(run.id(), 101L).orElseThrow().deliveryState());
            assertEquals(now, audits.findByIdAndTenantId(audit.id(), 101L).orElseThrow().createdAt());
            assertTrue(catalogs.findByIdAndTenantId(catalog.id(), 102L).isEmpty());
            assertTrue(drafts.findByIdAndTenantId(draft.id(), 102L).isEmpty());
            assertTrue(runs.findByIdAndTenantId(run.id(), 102L).isEmpty());
            assertTrue(audits.findByIdAndTenantId(audit.id(), 102L).isEmpty());
            var transport = objectMapper.readTree(objectMapper.writeValueAsString(new IdReference(draft.id(), draft.draftVersion())));
            assertTrue(transport.get("id").isString());
            assertEquals(draft.id().toString(), transport.get("id").asString());
            assertTrue(transport.get("version").isIntegralNumber());
            tx.setRollbackOnly();
        });
    }
    record IdReference(Long id, int version) {}

    @Test
    void database_rejects_cross_tenant_references_at_every_link_and_duplicate_versions() {
        var catalog = catalogs.save(new AnalyticsCatalogVersion(301L, "synthetic-constraints", 1, "{}", now));
        var draft = drafts.save(new AnalysisDraftVersion(301L, GlobalIds.next(), 1, 401L, catalog.id(), "{}", now));
        var run = runs.save(new AnalysisRun(301L, draft.id(), 401L, now));
        assertThrows(DataIntegrityViolationException.class, () -> drafts.save(new AnalysisDraftVersion(302L, GlobalIds.next(), 1, 401L, catalog.id(), "{}", now)));
        assertThrows(DataIntegrityViolationException.class, () -> runs.save(new AnalysisRun(302L, draft.id(), 401L, now)));
        assertThrows(DataIntegrityViolationException.class, () -> audits.save(new AnalysisAuditEvent(302L, run.id(), 401L, "SYNTHETIC", now)));
        assertThrows(DataIntegrityViolationException.class, () -> catalogs.save(new AnalyticsCatalogVersion(301L, catalog.code(), 1, "{}", now)));
        assertThrows(DataIntegrityViolationException.class, () -> drafts.save(new AnalysisDraftVersion(301L, draft.draftId(), 1, 401L, catalog.id(), "{}", now)));
        assertNotNull(catalogs.save(new AnalyticsCatalogVersion(302L, catalog.code(), 1, "{}", now)).id());
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("update RHN_AN_RUN set SD_STATE = 'COMPLETED' where ID_RUN = ?", run.id()));
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("update RHN_AN_RUN set SD_DELIV = 'READY' where ID_RUN = ?", run.id()));
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("delete from RHN_AN_DRAFT_VER where ID_DRAFT_VER = ?", draft.id()));
    }

    @Test
    void defaults_are_closed_and_entry_switch_never_enables_execution() throws Exception {
        mockMvc.perform(get("/api/analytics/capabilities").with(rhnWorkContext())).andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false)).andExpect(jsonPath("$.queryExecutionEnabled").value(false))
                .andExpect(jsonPath("$.contractVersion").value("a04-contract-v1"));
        assertTrue(new AnalyticsCapabilitiesService(true, false).current().enabled());
        assertFalse(new AnalyticsCapabilitiesService(true, false).current().queryExecutionEnabled());
        mockMvc.perform(get("/api/analytics/capabilities").header("X-Tenant-Id", TENANT)).andExpect(status().isUnauthorized());
    }

    @Test
    void generated_openapi_contains_only_capability_endpoint_and_string_id_policy() throws Exception {
        String body = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/analytics/capabilities'].get").exists())
                .andExpect(jsonPath("$.paths['/api/analytics/runs']").doesNotExist())
                .andExpect(jsonPath("$.components.schemas.AnalyticsCapabilities.properties.enabled.type").value("boolean"))
                .andExpect(jsonPath("$.components.schemas.ResidentResponse.properties.id.type").value("string"))
                .andReturn().getResponse().getContentAsString();
        // Explicit regeneration only; normal tests never modify committed contracts.
        String output = System.getProperty("rhn.openapi.output");
        if (output != null) Files.writeString(Path.of(output), body);
    }
}
