package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class StandardMappingStatusTruthTest extends RhnIntegrationTestSupport {
    @Test
    void pause_and_resume_preserve_expiry_and_never_extend_mapping_lifetime() throws Exception {
        String path = "/api/platform/master-data/standard-mappings/CATALOG_ITEM/362387869795101";
        JsonNode created = json(mockMvc.perform(post(path).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"conceptId":"362387869795011","mappingType":"CLINICAL","equivalence":"EXACT",
                         "primaryMapping":true,"limitation":"限有效期内使用","validFrom":"2026-01-01","validTo":"2026-12-31"}
                        """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode original = created.get("history").get(0), prior = original;
        String statusPath = "/api/platform/master-data/standard-mappings/mappings/" + original.get("id").asString() + "/status";
        for (String target : new String[]{"SUSPENDED", "ACTIVE"}) {
            JsonNode response = json(mockMvc.perform(post(statusPath).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"expectedRevision\":" + prior.get("revision").asLong() + ",\"status\":\"" + target + "\"}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.history.length()").value(1))
                    .andExpect(jsonPath("$.history[0].validTo").value("2026-12-31"))
                    .andReturn().getResponse().getContentAsString());
            JsonNode actual = response.get("history").get(0);
            assertThat(actual.get("revision").asLong()).isGreaterThan(prior.get("revision").asLong());
            assertThat(actual.get("status").asString()).isEqualTo(target);
            for (String field : new String[]{"id", "subjectId", "subjectType", "targetId", "conceptId", "codeSystemId", "mappingType", "equivalence", "primaryMapping", "limitation", "validFrom", "createdAt", "createdBy"}) {
                assertThat(actual.get(field)).as(field).isEqualTo(original.get(field));
            }
            JsonNode read = json(mockMvc.perform(get(path).with(rhnWorkContext()).param("businessDate", "2027-01-01"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.effectiveMappings").isEmpty())
                    .andReturn().getResponse().getContentAsString());
            assertThat(read.get("history")).isEqualTo(response.get("history"));
            prior = actual;
        }
        mockMvc.perform(post(statusPath).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":" + prior.get("revision").asLong() + ",\"status\":\"SUSPENDED\",\"validTo\":\"2027-12-31\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post(statusPath).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":" + prior.get("revision").asLong() + ",\"status\":\"RETIRED\",\"validTo\":\"2025-12-31\"}"))
                .andExpect(status().isBadRequest());
        JsonNode retired = json(mockMvc.perform(post(statusPath).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":" + prior.get("revision").asLong() + ",\"status\":\"RETIRED\",\"validTo\":\"2026-10-03\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.history[0].validTo").value("2026-10-03"))
                .andExpect(jsonPath("$.history[0].status").value("RETIRED"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post(statusPath).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":" + retired.get("history").get(0).get("revision").asLong() + ",\"status\":\"ACTIVE\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.history[0].validTo").value("2026-10-03"));
        mockMvc.perform(get(path).with(rhnWorkContext()).param("businessDate", "2026-10-04"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.effectiveMappings").isEmpty());
    }
}
