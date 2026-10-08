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
    void source_change_receipt_has_persisted_revision_and_supports_cancellation() throws Exception {
        JsonNode child = createOrganization("目录来源回执核验");
        String id = child.get("id").asString();
        long originalRevision = child.get("revision").asLong();
        JsonNode changed = json(mockMvc.perform(put("/api/platform/organizations/{id}/catalog-source", id)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"sourceOrganizationId":"%s"}
                                """.formatted(originalRevision, ORGANIZATION)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(changed.get("organizationId").asString()).isEqualTo(id);
        assertThat(changed.get("sourceOrganizationId").asString()).isEqualTo(ORGANIZATION);
        assertThat(changed.get("sourceOrganizationName").asString()).isNotBlank();
        assertThat(changed.get("organizationRevision").asLong()).isGreaterThan(originalRevision);
        JsonNode read = json(mockMvc.perform(get("/api/platform/organizations/{id}/catalog-source", id)
                        .with(rhnWorkContext())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(read).isEqualTo(changed);
        mockMvc.perform(put("/api/platform/organizations/{id}/catalog-source", id)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":" + originalRevision + "}"))
                .andExpect(status().isConflict());
        JsonNode cancelled = json(mockMvc.perform(put("/api/platform/organizations/{id}/catalog-source", id)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":" + changed.get("organizationRevision").asLong() + "}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(cancelled.get("sourceOrganizationId").isNull()).isTrue();
        assertThat(cancelled.get("organizationRevision").asLong())
                .isGreaterThan(changed.get("organizationRevision").asLong());
        assertThat(json(mockMvc.perform(get("/api/platform/organizations/{id}/catalog-source", id)
                        .with(rhnWorkContext())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString())).isEqualTo(cancelled);
    }

    @Test
    void shares_one_source_catalog_and_keeps_local_rules_as_overrides() throws Exception {
        mockMvc.perform(get("/api/platform/master-data/catalog-lifecycle/adoption-candidates").with(rhnWorkContext())
                        .param("organizationId", ORGANIZATION).param("itemType", "SERVICE")
                        .param("query", "SRV-CBC").param("businessDate", "2026-09-06")
                        .param("onlyUnadopted", "true").param("size", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.content").isEmpty());

        JsonNode child = createOrganization("目录共享分中心");
        String childId = child.get("id").asString();

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
                        .param("query", "SRV-CBC")
                        .param("size", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id == '362387869795101')].adoptionSourceType")
                        .value("SHARED"));

        mockMvc.perform(get("/api/platform/master-data/catalog-lifecycle/adoption-candidates").with(rhnWorkContext())
                        .param("organizationId", childId).param("itemType", "SERVICE")
                        .param("query", "SRV-CBC").param("businessDate", "2026-09-06")
                        .param("onlyUnadopted", "true").param("size", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.content").isEmpty());

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
        mockMvc.perform(put("/api/platform/organizations/{id}/catalog-source", grandchild.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"sourceOrganizationId":"%s"}
                                """.formatted(grandchild.get("revision").asLong(), childId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CATALOG_SOURCE_CHAIN_NOT_ALLOWED"));
    }

    @Test
    void adoption_batch_reports_partial_results_and_replays_without_duplicate_adoptions() throws Exception {
        String id = createOrganization("批量调入核验机构").get("id").asString();
        mockMvc.perform(post("/api/platform/master-data/catalog-lifecycle/catalog-items/362387869795101/adoptions")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"organizationId":"%s","orderable":true,"executable":true,"chargeable":true,
                                 "purchasable":false,"stocked":false,"dispensable":false,"returnable":false,
                                 "status":"ACTIVE","validFrom":"2027-01-01"}
                                """.formatted(id))).andExpect(status().isCreated());
        String requestCode = UUID.randomUUID().toString();
        String request = """
                {"requestCode":"%s","operationType":"ADOPT","organizationId":"%s","businessDate":"2026-10-03",
                 "catalogItemIds":["362387869795101","362387869795102"],
                 "template":{"orderable":true,"executable":true,"chargeable":true,"purchasable":false,
                  "stocked":false,"dispensable":false,"returnable":false,"status":"ACTIVE"}}
                """.formatted(requestCode, id);
        JsonNode batch = json(mockMvc.perform(post("/api/platform/master-data/catalog-lifecycle/adoption-batches")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PARTIAL"))
                .andExpect(jsonPath("$.totalRows").value(2)).andExpect(jsonPath("$.succeededRows").value(1))
                .andExpect(jsonPath("$.failedRows").value(1))
                .andExpect(jsonPath("$.rows[0].status").value("FAILED"))
                .andExpect(jsonPath("$.rows[0].errorCode").value("ADOPTION_PERIOD_OVERLAP"))
                .andExpect(jsonPath("$.rows[1].status").value("SUCCEEDED"))
                .andExpect(jsonPath("$.rows[1].targetResourceType").value("ORGANIZATION_ADOPTION"))
                .andExpect(jsonPath("$.rows[1].targetId").isString())
                .andReturn().getResponse().getContentAsString());
        JsonNode replay = json(mockMvc.perform(post("/api/platform/master-data/catalog-lifecycle/adoption-batches")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertThat(replay.get("id")).isEqualTo(batch.get("id"));
        assertThat(replay.get("rows")).isEqualTo(batch.get("rows"));
        assertThat(replay.get("requestCode").asString()).isEqualTo(requestCode);
        mockMvc.perform(post("/api/platform/master-data/catalog-lifecycle/adoption-batches")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(request.replace("\"orderable\":true", "\"orderable\":false")))
                .andExpect(status().isConflict());
        JsonNode read = json(mockMvc.perform(get("/api/platform/master-data/catalog-lifecycle/batches/{id}", batch.get("id").asString())
                        .with(rhnWorkContext())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(read).isEqualTo(replay);
        mockMvc.perform(get("/api/platform/master-data/catalog-lifecycle/catalog-items/362387869795102")
                        .param("organizationId", id).param("businessDate", "2026-10-03").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.adoptionHistory.length()").value(1))
                .andExpect(jsonPath("$.currentAdoption.id").value(batch.get("rows").get(1).get("targetId").asString()));
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
