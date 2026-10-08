package com.rhn;

import com.rhn.platform.terminology.application.TerminologyApplicationService;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.util.Collections;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DiseaseScopePersistenceTruthTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;
    @Autowired TerminologyApplicationService service;

    @Test void notesSurviveResponseReloadAndUnrelatedScopeEditsUntilExplicitlyCleared() throws Exception {
        var created = create(); String id = created.path("id").asString();
        var saved = save(id, created.path("revision").asLong(), "[]", """
                [{"conceptId":"362387869795011","inclusionMode":"INCLUDE","note":"  保留既有备注  "}]
                """, 200);
        assertTrue(saved.path("revision").asLong() > created.path("revision").asLong());
        assertEquals("保留既有备注", saved.path("members").get(0).path("note").asString());
        assertEquals("保留既有备注", note(id));
        var reloaded = load(id);
        assertEquals(saved.path("members"), reloaded.path("members"));
        var member = reloaded.path("members").get(0);
        String exceptions = objectMapper.writeValueAsString(java.util.List.of(java.util.Map.of(
                "conceptId", member.path("conceptId").asString(), "inclusionMode", "EXCLUDE", "note", member.path("note").asString())));
        var revised = save(id, reloaded.path("revision").asLong(), """
                [{"inclusionMode":"INCLUDE","sdDiagnosisDomain":"WESTERN_MEDICINE","note":"规则备注"}]
                """, exceptions, 200);
        assertEquals("保留既有备注", revised.path("members").get(0).path("note").asString());
        assertEquals("规则备注", revised.path("rules").get(0).path("note").asString());
        var cleared = save(id, revised.path("revision").asLong(), "[]", """
                [{"conceptId":"362387869795011","inclusionMode":"EXCLUDE","note":null}]
                """, 200);
        assertTrue(cleared.path("members").get(0).has("note"));
        assertTrue(cleared.path("members").get(0).path("note").isNull());
        assertNull(note(id));
        var stale = save(id, revised.path("revision").asLong(), "[]", exceptions, 409);
        assertEquals("STATE_CONFLICT", stale.path("code").asString());
        assertNull(note(id));
    }

    @Test void ambiguousOrIncompleteReplacementCannotSilentlyDeleteOrMergeScope() throws Exception {
        var created = create(); String id = created.path("id").asString();
        var baseline = save(id, created.path("revision").asLong(), "[]", """
                [{"conceptId":"362387869795011","inclusionMode":"INCLUDE","note":"不可丢失"}]
                """, 200);
        long revision = baseline.path("revision").asLong();
        var duplicate = save(id, revision, "[]", """
                [{"conceptId":"362387869795011","inclusionMode":"INCLUDE"},
                 {"conceptId":"362387869795011","inclusionMode":"EXCLUDE"}]
                """, 400);
        assertEquals("DISEASE_SCOPE_EXCEPTION_DUPLICATE", duplicate.path("code").asString());
        save(id, revision, "[null]", "[]", 400);
        save(id, revision, "[]", "[null]", 400);
        save(id, revision, "null", "[]", 400);
        assertThrows(BusinessException.class, () -> service.replaceDiseaseManagementScope(Long.valueOf(TENANT), Long.valueOf(id), revision, null, java.util.List.of()));
        var rule = new TerminologyApplicationService.DiseaseRuleCommand("INCLUDE", "WESTERN_MEDICINE", null, null, null, null, null, null);
        assertThrows(BusinessException.class, () -> service.replaceDiseaseManagementScope(Long.valueOf(TENANT), Long.valueOf(id), revision,
                Collections.nCopies(101, rule), java.util.List.of()));
        assertEquals(baseline, load(id));
        assertEquals("不可丢失", note(id));
    }

    @Test void runtimeMemberContractRequiresExplicitNullableNote() throws Exception {
        String document = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var schema = json(document).path("components").path("schemas").path("MemberView");
        assertTrue(schema.path("properties").path("note").path("type").toString().contains("null"));
        assertTrue(schema.path("required").toString().contains("note"));
        String export = System.getProperty("rhn.disease-scope.openapi-export");
        if (export != null) java.nio.file.Files.writeString(java.nio.file.Path.of(export), document);
    }

    @Test void legacyMembersPreserveRetainedFactsAndAllowExplicitRemoval() throws Exception {
        var created = create(); String id = created.path("id").asString();
        var baseline = save(id, created.path("revision").asLong(), "[]", """
                [{"conceptId":"362387869795011","inclusionMode":"INCLUDE","note":"旧名单备注"}]
                """, 200);
        var before = memberRows(id);
        var expanded = saveMembers(id, baseline.path("revision").asLong(), "[\"362387869795011\",\"362387869795012\"]", 200);
        assertEquals(2, expanded.path("members").size());
        assertTrue(memberRows(id).containsAll(before), "Retained member identity, dates, status and note must not be rebuilt");
        var reduced = saveMembers(id, expanded.path("revision").asLong(), "[\"362387869795011\"]", 200);
        assertEquals(before, memberRows(id));
        assertEquals("旧名单备注", reduced.path("members").get(0).path("note").asString());
        saveMembers(id, expanded.path("revision").asLong(), "[]", 409);
        assertEquals(before, memberRows(id));
        var cleared = saveMembers(id, reduced.path("revision").asLong(), "[]", 200);
        assertEquals(0, cleared.path("exceptionCount").asInt());
        assertTrue(memberRows(id).isEmpty());
        assertTrue(cleared.path("revision").asLong() > reduced.path("revision").asLong());
    }

    @Test void legacyMembersRejectAmbiguousInputsWithoutChangingStoredScope() throws Exception {
        var created = create(); String id = created.path("id").asString();
        var baseline = save(id, created.path("revision").asLong(), "[]", """
                [{"conceptId":"362387869795011","inclusionMode":"INCLUDE","note":"不可隐式清空"}]
                """, 200);
        long revision = baseline.path("revision").asLong();
        var rows = memberRows(id);
        assertEquals("DISEASE_MEMBERS_INPUT_INVALID", saveMembers(id, revision,
                "[\"362387869795011\",\"362387869795011\"]", 400).path("code").asString());
        saveMembers(id, revision, "null", 400);
        saveMembers(id, revision, "[null]", 400);
        saveMembers(id, revision, objectMapper.writeValueAsString(Collections.nCopies(1001, "362387869795011")), 400);
        for (java.util.Collection<Long> input : java.util.Arrays.<java.util.Collection<Long>>asList(null,
                java.util.Arrays.asList(362387869795011L, null), Collections.nCopies(2, 362387869795011L),
                Collections.nCopies(1001, 362387869795011L))) {
            var error = assertThrows(BusinessException.class, () -> service.replaceDiseaseManagementMembers(
                    Long.valueOf(TENANT), Long.valueOf(id), revision, input));
            assertEquals("DISEASE_MEMBERS_INPUT_INVALID", error.code());
        }
        assertEquals(baseline, load(id));
        assertEquals(rows, memberRows(id));
    }

    @Test void legacyMembersCannotFlattenRulesOrExclusions() throws Exception {
        for (boolean withRule : new boolean[]{false, true}) {
            var created = create(); String id = created.path("id").asString();
            var baseline = save(id, created.path("revision").asLong(), withRule
                    ? "[{\"inclusionMode\":\"INCLUDE\",\"sdDiagnosisDomain\":\"WESTERN_MEDICINE\"}]" : "[]",
                    "[{\"conceptId\":\"362387869795011\",\"inclusionMode\":\"" + (withRule ? "INCLUDE" : "EXCLUDE") + "\",\"note\":\"范围不可降级\"}]", 200);
            var rows = memberRows(id);
            for (String members : new String[]{"[]", "[\"362387869795011\"]"}) {
                var error = saveMembers(id, baseline.path("revision").asLong(), members, 409);
                assertEquals("DISEASE_SCOPE_REPLACEMENT_REQUIRED", error.path("code").asString());
                assertEquals(baseline, load(id));
                assertEquals(rows, memberRows(id));
            }
            var updated = save(id, baseline.path("revision").asLong(), "[]", "[]", 200);
            assertEquals(0, updated.path("ruleCount").asInt());
            assertEquals(0, updated.path("exceptionCount").asInt());
        }
    }

    private java.util.List<java.util.Map<String, Object>> memberRows(String id) {
        return jdbc.queryForList("select * from RHN_HPL_DISEASE_MGMT_MEMBER where ID_DISEASE_MGMT_PROG=? order by ID_CONCEPT", Long.valueOf(id));
    }
    private JsonNode saveMembers(String id, long revision, String members, int expected) throws Exception {
        return json(mockMvc.perform(put("/api/platform/terminology/disease-management-programs/{id}/members", id).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"expectedRevision":%d,"conceptIds":%s}
                """.formatted(revision, members)))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString());
    }

    private JsonNode create() throws Exception {
        return json(mockMvc.perform(post("/api/platform/terminology/disease-management-programs").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"productScope":false,"code":"NOTE_%s","name":"备注保存验证","sdManagementType":"SPECIAL_REGISTRY",
                 "sdTriggerAction":"PROMPT_CONFIRMATION","effectiveFrom":"2026-01-01"}
                """.formatted(UUID.randomUUID().toString().replace("-", "").toUpperCase())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }
    private JsonNode save(String id, long revision, String rules, String members, int expected) throws Exception {
        return json(mockMvc.perform(put("/api/platform/terminology/disease-management-programs/{id}/scope", id).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"expectedRevision":%d,"rules":%s,"exceptions":%s}
                """.formatted(revision, rules, members)))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString());
    }
    private JsonNode load(String id) throws Exception {
        var values = json(mockMvc.perform(get("/api/platform/terminology/disease-management-programs").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        for (var value : values) if (id.equals(value.path("id").asString())) return value;
        throw new AssertionError("Program not reloaded");
    }
    private String note(String id) {
        return jdbc.queryForObject("select DES_NOTE from RHN_HPL_DISEASE_MGMT_MEMBER where ID_DISEASE_MGMT_PROG=?", String.class, Long.valueOf(id));
    }
}
