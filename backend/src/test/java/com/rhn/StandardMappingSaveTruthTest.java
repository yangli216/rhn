package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class StandardMappingSaveTruthTest extends RhnIntegrationTestSupport {
    private final String path = "/api/platform/master-data/standard-mappings/CATALOG_ITEM/362387869795101";

    @Test
    void create_and_replace_return_exact_persisted_fields_without_rewriting_other_history() throws Exception {
        JsonNode first = create("""
                {"conceptId":"362387869795011","mappingType":"CLINICAL","equivalence":"RELATED","primaryMapping":false,
                 "limitation":"  首次指定范围  ","validFrom":"2026-01-01","validTo":"2028-12-31"}
                """);
        JsonNode original = first.get("history").get(0);
        assertThat(original.get("conceptId").asString()).isEqualTo("362387869795011");
        assertThat(original.get("equivalence").asString()).isEqualTo("RELATED");
        assertThat(original.get("mappingType").asString()).isEqualTo("CLINICAL");
        assertThat(original.get("primaryMapping").asBoolean()).isFalse();
        assertThat(original.get("limitation").asString()).isEqualTo("首次指定范围");
        assertThat(original.get("validFrom").asString()).isEqualTo("2026-01-01");
        assertThat(original.get("validTo").asString()).isEqualTo("2028-12-31");
        assertThat(read("2026-01-01")).isEqualTo(first);

        JsonNode withOther = create("""
                {"conceptId":"362387869795011","mappingType":"REGULATORY","equivalence":"EXACT","primaryMapping":false,
                 "validFrom":"2026-02-01","validTo":"2028-12-31"}
                """);
        JsonNode other = findByType(withOther, "REGULATORY");
        String replacement = """
                {"conceptId":"362387869795012","mappingType":"CLINICAL","equivalence":"EQUIVALENT","primaryMapping":false,
                 "limitation":"  替代指定范围  ","validFrom":"2027-01-01","validTo":"2028-12-31",
                 "replacesMappingId":"%s","expectedReplacesRevision":%d}
                """.formatted(original.get("id").asString(), original.get("revision").asLong());
        JsonNode result = create(replacement);
        assertThat(result.get("history").size()).isEqualTo(3);
        assertThat(findByType(result, "REGULATORY")).isEqualTo(other);
        JsonNode replaced = null, added = null;
        for (JsonNode row : result.get("history")) {
            if (row.get("id").equals(original.get("id"))) replaced = row;
            if (row.get("conceptId").asString().equals("362387869795012")) added = row;
        }
        assertThat(replaced).isNotNull();
        assertThat(added).isNotNull();
        assertThat(replaced.get("status").asString()).isEqualTo("SUPERSEDED");
        assertThat(replaced.get("validTo").asString()).isEqualTo("2026-12-31");
        assertThat(replaced.get("revision").asLong()).isGreaterThan(original.get("revision").asLong());
        for (String field : new String[]{"subjectId", "subjectType", "targetId", "conceptId", "codeSystemId", "mappingType", "equivalence", "primaryMapping", "limitation", "validFrom", "createdAt", "createdBy"}) {
            assertThat(replaced.get(field)).as(field).isEqualTo(original.get(field));
        }
        assertThat(added.get("id")).isNotEqualTo(original.get("id"));
        assertThat(added.get("replacesMappingId")).isEqualTo(original.get("id"));
        assertThat(added.get("equivalence").asString()).isEqualTo("EQUIVALENT");
        assertThat(added.get("primaryMapping").asBoolean()).isFalse();
        assertThat(added.get("limitation").asString()).isEqualTo("替代指定范围");
        assertThat(added.get("validFrom").asString()).isEqualTo("2027-01-01");
        assertThat(added.get("validTo").asString()).isEqualTo("2028-12-31");
        assertThat(added.get("status").asString()).isEqualTo("ACTIVE");
        assertThat(read("2027-01-01")).isEqualTo(result);
        mockMvc.perform(post(path).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(replacement))
                .andExpect(status().isConflict());
        assertThat(read("2027-01-01")).isEqualTo(result);
        JsonNode terms = json(mockMvc.perform(get("/api/platform/master-data/standard-mappings/terms")
                        .with(rhnWorkContext()).param("codeSystemId", added.get("codeSystemId").asString())
                        .param("businessDate", "2027-01-01").param("query", added.get("termCode").asString()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(terms.get(0).get("id")).isEqualTo(added.get("conceptId"));
        assertThat(terms.get(0).get("display")).isEqualTo(added.get("termDisplay"));
    }
    private JsonNode create(String body) throws Exception {
        return json(mockMvc.perform(post(path).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }
    private JsonNode read(String date) throws Exception {
        return json(mockMvc.perform(get(path).with(rhnWorkContext()).param("businessDate", date))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
    private JsonNode findByType(JsonNode snapshot, String type) {
        for (JsonNode row : snapshot.get("history")) if (row.get("mappingType").asString().equals(type)) return row;
        throw new AssertionError("Missing mapping " + type);
    }
}
