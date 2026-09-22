package com.rhn;

import org.junit.jupiter.api.Test;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;

class StandardMedicationCatalogTest extends RhnIntegrationTestSupport {
    private static final String PATH = "/api/platform/master-data/medication-standard-catalog";

    @Test
    void exposes_reference_provenance_without_claiming_clinical_approval() throws Exception {
        mockMvc.perform(get(PATH + "/summary").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.statistics.entries").value(794))
                .andExpect(jsonPath("$.statistics.scopeEntries").value(7))
                .andExpect(jsonPath("$.source.verificationStatus").value("UNVERIFIED"))
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
    void requires_authentication() throws Exception {
        mockMvc.perform(get(PATH).header("X-Tenant-Id", TENANT)).andExpect(status().isUnauthorized());
    }
}
