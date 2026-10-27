package com.rhn;

import com.rhn.platform.masterdata.domain.*;
import com.rhn.platform.masterdata.infrastructure.*;
import com.rhn.platform.search.application.SearchEntryProjectionService;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 真索引、真目录与就诊权限；检查组合不能复用项目 ID 去重，也不能在限量前截断可开立范围。 */
class ExaminationOrderSearchTest extends RhnIntegrationTestSupport {
    private static final Long ACTOR = 362387869790222L;
    @Autowired ServiceCatalogItemRepository services;
    @Autowired OrganizationCatalogItemRepository adoptions;
    @Autowired ExaminationServiceRepository examinations;
    @Autowired ServiceVariantRepository variants;
    @Autowired SearchEntryProjectionService projections;
    @Autowired EntityManagerFactory entityManagerFactory;

    @Test void searchesChineseAndInitialsAndKeepsTechniquesAndSitesDistinct() throws Exception {
        var ct = item("组合CT平扫", "CT", null, "PLAIN", true);
        var head = site(ct, "HEAD", "头部");
        var abdomen = site(ct, "ABDOMEN", "腹部");
        var us = item("常规超声检查", "ULTRASOUND", "B_MODE", null, true);
        var usAbdomen = site(us, "ABDOMEN", "腹部");
        var color = item("彩色多普勒超声检查", "ULTRASOUND", "COLOR_DOPPLER", null, true);
        site(color, "ABDOMEN", "腹部");
        var encounter = startedEncounter();
        for (String query : List.of("头部CT", "tbct", "CT头部", "t b c t")) {
            assertThat(candidateKeys(search(encounter, query))).contains(ct.id() + ":" + head.id());
        }
        for (String query : List.of("腹部B超", "fbbc")) {
            var keys = candidateKeys(search(encounter, query));
            assertThat(keys).contains(us.id() + ":" + usAbdomen.id());
            assertThat(keys).noneMatch(key -> key.startsWith(color.id() + ":"));
        }
        var ctResults = search(encounter, "组合CT平扫");
        assertThat(candidateKeys(ctResults)).contains(ct.id() + ":" + head.id(), ct.id() + ":" + abdomen.id());
        var serviceIds = new ArrayList<String>();
        ctResults.path("services").forEach(value -> serviceIds.add(value.path("id").asString()));
        assertThat(serviceIds).doesNotHaveDuplicates();
        // 组合命中只预填：原部位接口仍提供后续核验与计价规则。
        mockMvc.perform(get("/api/encounters/{id}/service-requests/examination-sites", encounter)
                .with(rhnWorkContext()).param("catalogItemId", ct.id().toString())).andExpect(status().isOk());
    }

    @Test void refreshesRenamedAndInactiveSitesAndBackfillsExistingConfiguration() throws Exception {
        var ct = item("生命周期CT", "CT", null, "PLAIN", true);
        var site = site(ct, "LIFE", "生命周期部位");
        var encounter = startedEncounter();
        assertThat(candidateKeys(search(encounter, "生命周期部位CT"))).contains(ct.id() + ":" + site.id());
        updateSite(ct, site, "改名部位", "ACTIVE");
        assertThat(candidateKeys(search(encounter, "生命周期部位CT"))).doesNotContain(ct.id() + ":" + site.id());
        assertThat(candidateKeys(search(encounter, "改名部位CT"))).contains(ct.id() + ":" + site.id());
        updateSite(ct, variants.findById(site.id()).orElseThrow(), "改名部位", "INACTIVE");
        assertThat(candidateKeys(search(encounter, "改名部位CT"))).doesNotContain(ct.id() + ":" + site.id());
        var oldSite = variants.saveAndFlush(new ServiceVariant(Long.valueOf(TENANT), ct.id(), null,
                "BACKFILL", "补齐部位", "STANDARD", true, null, 0, "ACTIVE", ACTOR));
        projections.rebuildExaminationSites();
        projections.rebuildExaminationSites(); // 可重入且不产生重复候选
        assertThat(candidateKeys(search(encounter, "补齐部位CT"))).containsOnly(ct.id() + ":" + oldSite.id());
    }

    @Test void limitsResultsAfterInstitutionFilteringAndBatchesDetailsWithoutPerSiteReads() throws Exception {
        var unadopted = item("未启用性能CT", "CT", null, "PLAIN", false);
        for (int i = 0; i < 35; i++) rawSite(unadopted, "OFF" + i, "性能部位" + i);
        projections.synchronizeService(unadopted, ACTOR);
        var ct = item("性能CT", "CT", null, "PLAIN", true);
        for (int i = 0; i < 35; i++) rawSite(ct, "ON" + i, "性能部位" + i);
        projections.synchronizeService(ct, ACTOR);
        var encounter = startedEncounter();
        search(encounter, "性能部位0CT"); // 预热认证/字典等缓存
        var stats = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        boolean previous = stats.isStatisticsEnabled();
        stats.setStatisticsEnabled(true);
        try {
            stats.clear();
            var one = search(encounter, "性能部位0CT");
            long oneStatements = stats.getPrepareStatementCount();
            stats.clear();
            var many = search(encounter, "性能部位");
            long manyStatements = stats.getPrepareStatementCount();
            assertThat(one.path("candidates").size()).isEqualTo(1);
            assertThat(many.path("candidates").size()).isEqualTo(30);
            assertThat(many.path("services").size()).isEqualTo(1);
            assertThat(candidateKeys(many)).allMatch(key -> key.startsWith(ct.id() + ":"));
            assertThat(manyStatements).isLessThanOrEqualTo(oneStatements + 2);
            System.out.printf("[examination-search] candidates: 1 -> 30; SQL statements: %d -> %d; service details: %d%n",
                    oneStatements, manyStatements, many.path("services").size());
            assertThat(search(encounter, "%").path("candidates").size()).isZero();
            assertThat(search(encounter, "_").path("candidates").size()).isZero();
        } finally { stats.setStatisticsEnabled(previous); }
    }

    @Test void requiresAnAccessibleActiveEncounter() throws Exception {
        mockMvc.perform(get("/api/encounters/999999999/service-requests/examination-search")
                .with(rhnWorkContext()).param("query", "头部CT")).andExpect(status().isNotFound());
    }

    private ServiceCatalogItem item(String name, String modality, String technique, String phase, boolean adopt) {
        var seed = services.findById(362387869795103L).orElseThrow();
        var value = services.saveAndFlush(new ServiceCatalogItem(Long.valueOf(TENANT), ACTOR, seed.itemTypeId(),
                "ES-" + UUID.randomUUID(), name, "次", true, true, "ACTIVE", LocalDate.of(2020, 1, 1), null,
                "EXAMINATION", null, "COMMON", true, false, true, null, modality, null, null,
                null, null, 3, null, false, null, null));
        var profile = new ExaminationService(Long.valueOf(TENANT), value.id(), modality, 3, null);
        profile.changeOrderingAttributes(technique, phase);
        examinations.saveAndFlush(profile);
        if (adopt) adoptions.saveAndFlush(new OrganizationCatalogItem(Long.valueOf(TENANT), ACTOR,
                Long.valueOf(ORGANIZATION), value.id(), Long.valueOf(DEPARTMENT), value.code(), value.name(),
                true, true, true, false, false, false, false, "ACTIVE", LocalDate.of(2020, 1, 1), null));
        return value;
    }
    private ServiceVariant rawSite(ServiceCatalogItem item, String code, String name) {
        return variants.saveAndFlush(new ServiceVariant(Long.valueOf(TENANT), item.id(), null, code, name,
                "STANDARD", true, null, 0, "ACTIVE", ACTOR));
    }
    private ServiceVariant site(ServiceCatalogItem item, String code, String name) {
        var value = rawSite(item, code, name);
        projections.synchronizeService(item, ACTOR);
        return value;
    }
    private void updateSite(ServiceCatalogItem item, ServiceVariant site, String name, String status) throws Exception {
        mockMvc.perform(put("/api/platform/master-data/operations/services/{id}/examination-variants/{variantId}", item.id(), site.id())
                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                {"expectedRevision":%d,"code":"%s","name":"%s","methodType":"STANDARD",
                 "bodySiteRequired":true,"sortOrder":0,"status":"%s"}
                """.formatted(site.revision(), site.code(), name, status))).andExpect(status().isOk());
    }
    private JsonNode search(String encounter, String query) throws Exception {
        return json(mockMvc.perform(get("/api/encounters/{id}/service-requests/examination-search", encounter)
                .with(rhnWorkContext()).param("query", query)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }
    private List<String> candidateKeys(JsonNode result) {
        var keys = new ArrayList<String>();
        result.path("candidates").forEach(value -> keys.add(value.path("catalogItemId").asString() + ":" + value.path("site").path("variantId").asString()));
        return keys;
    }
    private String startedEncounter() throws Exception {
        var resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"fullName":"组合检索测试","gender":"2","birthDate":"1990-05-05",
                 "identifiers":[{"system":"9","value":"ES-%s","useType":"SECONDARY"}]}
                """.formatted(UUID.randomUUID()))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        var encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                """.formatted(resident.path("id").asString(), ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String id = encounter.path("id").asString();
        mockMvc.perform(verifiedEncounterStart(id)).andExpect(status().isOk());
        return id;
    }
}
