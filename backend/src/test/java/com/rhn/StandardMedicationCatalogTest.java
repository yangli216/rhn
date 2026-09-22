package com.rhn;

import org.junit.jupiter.api.Test;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;

class StandardMedicationCatalogTest extends RhnIntegrationTestSupport {
    @org.springframework.beans.factory.annotation.Autowired
    com.rhn.platform.masterdata.application.StandardMedicationCatalogService catalog;
    private static final String PATH = "/api/platform/master-data/medication-standard-catalog";

    @Test
    void exposes_reference_provenance_without_claiming_clinical_approval() throws Exception {
        mockMvc.perform(get(PATH + "/summary").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.statistics.entries").value(794))
                .andExpect(jsonPath("$.statistics.scopeEntries").value(7))
                .andExpect(jsonPath("$.source.verificationStatus").value("UNVERIFIED"))
                .andExpect(jsonPath("$.source.publicationVerificationStatus").value("VERIFIED"))
                .andExpect(jsonPath("$.source.publicationNumber").value("国卫药政发〔2026〕17号"))
                .andExpect(jsonPath("$.statistics.orderableSpecifications").value(0));
    }

    @Test
    void amoxicillin_exposes_eight_separate_presentations_with_no_inferred_directions() throws Exception {
        var response = mockMvc.perform(get(PATH).with(rhn()).param("query", "MED-2026-W006"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andReturn().getResponse().getContentAsString();
        String id = json(response).path("content").get(0).path("id").asString();
        var detail = json(mockMvc.perform(get(PATH + "/" + id).with(rhn())).andExpect(status().isOk())
                .andExpect(jsonPath("$.specifications.length()").value(8))
                .andReturn().getResponse().getContentAsString());
        detail.path("specifications").forEach(spec -> {
            assertThat(spec.path("orderable").asBoolean()).isFalse();
            assertThat(spec.path("clinicalAttributes").path("defaultRoute").isNull()).isTrue();
            assertThat(spec.path("clinicalAttributes").path("skinTestRequired").isNull()).isTrue();
        });
    }

    @Test
    void scope_filter_preserves_all_scope_entries_without_orderable_specifications() throws Exception {
        mockMvc.perform(get(PATH).with(rhn()).param("state", "SCOPE"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(7))
                .andExpect(jsonPath("$.content[0].specificationCount").value(0));
    }

    @Test
    void rejects_invalid_pagination_filters_and_unknown_entry() throws Exception {
        mockMvc.perform(get(PATH).with(rhn()).param("size", "1000")).andExpect(status().isBadRequest());
        mockMvc.perform(get(PATH).with(rhn()).param("state", "ACTIVE")).andExpect(status().isBadRequest());
        mockMvc.perform(get(PATH + "/unknown").with(rhn())).andExpect(status().isNotFound());
    }

    @Test
    void incomplete_source_identity_is_visible_in_catalog_detail_and_review_filter() throws Exception {
        var response = json(mockMvc.perform(get(PATH).with(rhn()).param("query", "MED-2026-W007").param("state", "REVIEW"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        String id = response.path("content").get(0).path("id").asString();
        var detail = json(mockMvc.perform(get(PATH + "/" + id).with(rhn())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(detail.path("specifications").valueStream().filter(spec -> "4:1".equals(spec.path("specification").asString()))
                .findFirst().orElseThrow().path("identityIssues").get(0).asString()).isEqualTo("STANDARD_SPECIFICATION_INCOMPLETE");
    }

    @Test
    void complete_prefix_specs_survive_joined_paragraphs_but_fragments_and_later_forms_do_not() {
        var specs = catalog.snapshot().path("specifications");
        var valid = specs.valueStream().filter(s -> "MED-2026-T054".equals(s.path("legacyCode").asString())
                && s.path("specification").asString().replaceAll("\\s+", "").startsWith("每丸重9g")).findFirst().orElseThrow();
        assertThat(catalog.specificationIdentityIssues(valid)).isEmpty();
        var joined = specs.valueStream().filter(s -> "MED-2026-T054".equals(s.path("legacyCode").asString())
                && s.path("specification").asString().contains("颗粒剂:")).findFirst().orElseThrow();
        assertThat(catalog.specificationIdentityIssues(joined)).contains("STANDARD_SOURCE_FORM_BLOCK_REQUIRES_REVIEW");
        specs.valueStream().filter(s -> "MED-2026-T055".equals(s.path("legacyCode").asString())).forEach(s ->
                assertThat(catalog.specificationIdentityIssues(s)).contains("STANDARD_COMPOSITION_FRAGMENT_REQUIRES_REVIEW"));
    }

    @Test
    void explicit_aliases_offer_candidates_without_splitting_compound_names_or_fuzzy_matching() {
        assertThat(catalog.identityCandidates("LOCAL", "本院名", "旧别名；头孢曲松")).isNotEmpty();
        assertThat(catalog.identityCandidates("LOCAL", "本院名", "阿莫西林/克拉维酸")).isEmpty();
        assertThat(catalog.identityCandidates("LOCAL", "本院名", "头孢曲松相似药")).isEmpty();
    }

    @Test
    void requires_authentication() throws Exception {
        mockMvc.perform(get(PATH).header("X-Tenant-Id", TENANT)).andExpect(status().isUnauthorized());
    }
}
