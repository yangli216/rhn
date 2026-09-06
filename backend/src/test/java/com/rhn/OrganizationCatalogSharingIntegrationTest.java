package com.rhn;

import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class OrganizationCatalogSharingIntegrationTest extends RhnIntegrationTestSupport {
    @Autowired
    CatalogLifecycleDirectory catalogLifecycleDirectory;

    @Test
    void shares_one_source_catalog_and_keeps_local_rules_as_overrides() throws Exception {
        JsonNode child = createOrganization("目录共享分中心");
        String childId = child.get("id").asText();

        mockMvc.perform(put("/api/platform/organizations/{id}/catalog-source", childId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"sourceOrganizationId":"%s"}
                                """.formatted(child.get("revision").asLong(), ORGANIZATION)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sourceOrganizationId").value(ORGANIZATION));

        var shared = catalogLifecycleDirectory.resolve(Long.valueOf(TENANT), 362387869795101L,
                Long.valueOf(childId), null, "SALE", LocalDate.parse("2026-09-06"));
        assertThat(shared.adoption()).isNotNull();
        assertThat(shared.adoption().organizationId()).isEqualTo(Long.valueOf(ORGANIZATION));
        assertThat(shared.adoption().defaultDepartmentId()).isNull();

        mockMvc.perform(get("/api/platform/master-data/catalog-lifecycle/adoption-candidates").with(rhnWorkContext())
                        .param("organizationId", childId).param("itemType", "SERVICE")
                        .param("size", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id == '362387869795101')].adoptionSourceType")
                        .value("SHARED"));

        mockMvc.perform(post("/api/platform/master-data/catalog-lifecycle/catalog-items/{id}/adoptions",
                                "362387869795101").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","orderable":false,"executable":false,
                                  "chargeable":false,"purchasable":false,"stocked":false,
                                  "dispensable":false,"returnable":false,"status":"SUSPENDED",
                                  "validFrom":"2026-09-06"
                                }
                                """.formatted(childId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.currentAdoption").doesNotExist());
        assertThat(catalogLifecycleDirectory.resolve(Long.valueOf(TENANT), 362387869795101L,
                Long.valueOf(childId), null, "SALE", LocalDate.parse("2026-09-06")).adoption()).isNull();

        mockMvc.perform(post("/api/platform/master-data/catalog-lifecycle/catalog-items/{id}/adoptions",
                                "362387869795102").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","localCode":"CHILD-LAB-GLU",
                                  "orderable":true,"executable":true,"chargeable":true,
                                  "purchasable":false,"stocked":false,"dispensable":false,
                                  "returnable":false,"status":"ACTIVE","validFrom":"2026-09-06"
                                }
                                """.formatted(childId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.currentAdoption.organizationId").value(childId));
        assertThat(catalogLifecycleDirectory.resolve(Long.valueOf(TENANT), 362387869795102L,
                Long.valueOf(childId), null, "SALE", LocalDate.parse("2026-09-06"))
                .adoption().localCode()).isEqualTo("CHILD-LAB-GLU");

        JsonNode grandchild = createOrganization("目录共享下级机构");
        mockMvc.perform(put("/api/platform/organizations/{id}/catalog-source", grandchild.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"sourceOrganizationId":"%s"}
                                """.formatted(grandchild.get("revision").asLong(), childId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CATALOG_SOURCE_CHAIN_NOT_ALLOWED"));
    }

    private JsonNode createOrganization(String name) throws Exception {
        String code = "CAT" + UUID.randomUUID().toString().substring(0, 8).replace("-", "");
        return json(mockMvc.perform(post("/api/platform/organizations").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"parentId":"%s","code":"%s","name":"%s",
                                 "type":"CLINIC","validFrom":"2026-01-01"}
                                """.formatted(ORGANIZATION, code, name)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }
}
