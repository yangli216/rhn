package com.rhn;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/** Real directory responses used by template editors; no mocked page metadata. */
class TemplateCatalogPagingContractTest extends RhnIntegrationTestSupport {
    @ParameterizedTest
    @ValueSource(strings = {"/api/platform/master-data/services/search", "/api/platform/master-data/medications/search",
            "/api/platform/master-data/medication-products/search", "/api/platform/terminology/diseases/search"})
    void invalid_page_size_is_a_field_validation_error_not_a_server_failure(String path) throws Exception {
        for (String size : new String[]{"8", "not-a-number"}) {
            mockMvc.perform(get(path).with(rhnWorkContext()).param("size", size))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.violations[0].field").value("size"));
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/platform/master-data/services/search", "/api/platform/master-data/medications/search",
            "/api/platform/master-data/medication-products/search", "/api/platform/terminology/diseases/search"})
    void template_search_uses_supported_ten_row_pages(String path) throws Exception {
        var page = json(mockMvc.perform(get(path).with(rhnWorkContext())
                .param("status", "ACTIVE").param("organizationId", ORGANIZATION)
                .param("page", "0").param("size", "10"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(10, page.path("size").asInt());
        assertEquals(0, page.path("page").asInt());
        long total = page.path("totalElements").asLong();
        assertTrue(total > 0, "Seeded directories must provide actual rows for this contract check");
        assertEquals((total + 9) / 10, page.path("totalPages").asLong());
        assertEquals(Math.min(total, 10), page.path("content").size());
    }

    @Test
    void service_search_exposes_current_institution_adoption_and_chargeability() throws Exception {
        var page = json(mockMvc.perform(get("/api/platform/master-data/services/search").with(rhnWorkContext())
                .param("query", "血常规").param("status", "ACTIVE").param("organizationId", ORGANIZATION)
                .param("page", "0").param("size", "10"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertTrue(page.path("content").size() > 0);
        boolean found = false;
        for (var item : page.path("content")) {
            var adoption = item.path("organizationAdoption");
            if (!ORGANIZATION.equals(adoption.path("organizationId").asString())) continue;
            found = true;
            assertEquals(item.path("id").asString(), adoption.path("catalogItemId").asString());
            assertTrue(item.path("unitCode").isString());
            assertTrue(item.path("validFrom").isString());
            assertTrue(item.path("orderable").isBoolean());
            assertTrue(item.path("chargeable").isBoolean());
            assertTrue(adoption.path("orderable").isBoolean());
            assertTrue(adoption.path("executable").isBoolean());
            assertTrue(adoption.path("chargeable").isBoolean());
            assertTrue(adoption.path("validFrom").isString());
        }
        assertTrue(found, "The known institution service must carry its adoption evidence");
    }
}
