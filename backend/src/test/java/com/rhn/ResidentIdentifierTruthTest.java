package com.rhn;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItems;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ResidentIdentifierTruthTest extends RhnIntegrationTestSupport {
    @Autowired private JdbcTemplate jdbc;

    @Test
    void resident_dictionary_exposes_real_card_namespaces_without_changing_rc038() throws Exception {
        mockMvc.perform(get("/api/platform/dictionaries/resolve/PI_RESIDENT_IDENTIFIER_SYSTEM").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].code", hasItems("1", "6", "9", "SOCIAL_SECURITY_CARD",
                        "HEALTH_CARD", "HOSPITAL_MRN", "BIRTH_CERTIFICATE")));
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM RHN_BD_DICT_ITEM i JOIN RHN_BD_DICT_DEF d
                ON d.ID_DICT_DEF = i.ID_DICT_DEF_DICT
                WHERE d.CD_DICT_DEF = 'PI_IDENTIFIER_TYPE' AND d.CD_SCOPE = 'PLATFORM'
                """, Integer.class)).isEqualTo(7);
    }

    @Test
    void equal_values_in_different_systems_remain_distinct_for_storage_and_matching() throws Exception {
        String value = UUID.randomUUID().toString();
        for (String system : new String[]{"SOCIAL_SECURITY_CARD", "HEALTH_CARD", "HOSPITAL_MRN", "BIRTH_CERTIFICATE"}) {
            JsonNode resident = create(identifier(system, value));
            assertThat(resident.path("identifiers").get(0).path("system").asString()).isEqualTo(system);
            JsonNode source = ingest(identifier(system, value));
            assertThat(source.path("matchStatus").asString()).isEqualTo("REVIEW");
            assertThat(source.path("residentId").isNull()).isTrue();
            assertThat(source.path("candidates").size()).isEqualTo(1);
            assertThat(source.path("candidates").get(0).path("residentId").asString())
                    .isEqualTo(resident.path("id").asString());
        }
    }

    @Test
    void same_resident_can_record_equal_values_in_two_distinct_systems() throws Exception {
        String value = UUID.randomUUID().toString();
        JsonNode resident = create(identifier("HEALTH_CARD", value) + "," + identifier("SOCIAL_SECURITY_CARD", value));
        assertThat(resident.path("identifiers").size()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(DISTINCT CD_IDENT_SYS) FROM RHN_PI_PAT_IDENT WHERE ID_PAT = ?",
                Integer.class, Long.valueOf(resident.path("id").asString()))).isEqualTo(2);
    }

    @ParameterizedTest
    @ValueSource(strings = {"SOCIAL_SECURITY_CARD", "HEALTH_CARD", "HOSPITAL_MRN", "BIRTH_CERTIFICATE", "9"})
    void legacy_other_number_is_review_evidence_never_an_automatic_identity(String incomingSystem) throws Exception {
        String value = UUID.randomUUID().toString();
        JsonNode resident = create(identifier("9", value));
        JsonNode source = ingest(identifier(incomingSystem, value));
        assertThat(source.path("matchStatus").asString()).isEqualTo("REVIEW");
        assertThat(source.path("residentId").isNull()).isTrue();
        JsonNode candidate = source.path("candidates").get(0);
        assertThat(candidate.path("residentId").asString()).isEqualTo(resident.path("id").asString());
        assertThat(candidate.path("reasonsJson").asString()).contains("IDENTIFIER_SCOPE_REQUIRES_REVIEW");
        assertThat(candidate.path("score").isNull()).isTrue();
        assertThat(jdbc.queryForObject("SELECT CD_IDENT_SYS FROM RHN_PI_PAT_IDENT WHERE ID_PAT = ?",
                String.class, Long.valueOf(resident.path("id").asString()))).isEqualTo("9");
    }

    @Test
    void legacy_collision_blocks_automatic_link_even_with_a_typed_candidate() throws Exception {
        String value = UUID.randomUUID().toString();
        create(identifier("9", value));
        create(identifier("HEALTH_CARD", value));
        JsonNode source = ingest(identifier("HEALTH_CARD", value));
        assertThat(source.path("matchStatus").asString()).isEqualTo("REVIEW");
        assertThat(source.path("candidates").size()).isEqualTo(2);
        assertThat(source.path("residentId").isNull()).isTrue();
    }

    @Test
    void verified_document_aliases_still_match_but_conflicting_card_evidence_requires_review() throws Exception {
        String passport = UUID.randomUUID().toString();
        JsonNode resident = create(identifier("PASSPORT", passport));
        assertThat(resident.path("identifiers").get(0).path("system").asString()).isEqualTo("6");
        JsonNode source = ingest(identifier("PASSPORT", passport));
        assertThat(source.path("matchStatus").asString()).isEqualTo("MATCHED");
        assertThat(source.path("residentId").asString()).isEqualTo(resident.path("id").asString());

        String card = UUID.randomUUID().toString();
        create(identifier("9", card));
        JsonNode conflicting = ingest(identifier("PASSPORT", passport) + "," + identifier("HEALTH_CARD", card));
        assertThat(conflicting.path("matchStatus").asString()).isEqualTo("REVIEW");
        assertThat(conflicting.path("residentId").isNull()).isTrue();
        assertThat(conflicting.path("candidates").size()).isEqualTo(2);
    }

    @Test
    void unknown_source_identifier_type_is_rejected_without_persisting_a_source_record() throws Exception {
        String sourceRecordId = UUID.randomUUID().toString();
        mockMvc.perform(post("/api/residents/source-records").with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content(sourcePayload(sourceRecordId, identifier("UNCONFIGURED_CARD", "12345"))))
                .andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM RHN_PI_PAT_SRC_RECORD WHERE ID_SRC_RECORD = ?",
                Integer.class, sourceRecordId)).isZero();
    }

    private JsonNode create(String identifiers) throws Exception {
        return json(mockMvc.perform(post("/api/residents").with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"证件类型测试","gender":"MALE","birthDate":"1966-01-01","identifiers":[%s]}
                                """.formatted(identifiers)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode ingest(String identifiers) throws Exception {
        return json(mockMvc.perform(post("/api/residents/source-records").with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content(sourcePayload(UUID.randomUUID().toString(), identifiers)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private String sourcePayload(String recordId, String identifiers) {
        return """
                {"sourceOrganizationId":"%s","sourceSystem":"TYPE-TRUTH","sourceRecordId":"%s",
                "fullName":"外部来源记录","gender":"MALE","birthDate":"1966-01-01","identifiers":[%s]}
                """.formatted(ORGANIZATION, recordId, identifiers);
    }

    private String identifier(String system, String value) {
        return """
                {"system":"%s","value":"%s","useType":"OFFICIAL"}
                """.formatted(system, value);
    }
}
