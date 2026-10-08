package com.rhn;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ParameterRollbackSnapshotTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;
    @Autowired ConfigurationDirectory directory;

    @Test
    void rejects_non_boolean_or_missing_active_without_changing_value_audit_or_cached_resolution() throws Exception {
        Fixture fixture = fixture("STRING", "NORMAL", "TENANT", "OVERRIDE", "\"old\"", false);
        for (String active : List.of("\"false\"", "0", "1", "null", "{}", "[]")) {
            ObjectNode snapshot = (ObjectNode) json(fixture.snapshot());
            snapshot.set("active", json(active));
            reject(fixture, snapshot.toString());
        }
        ObjectNode missing = (ObjectNode) json(fixture.snapshot());
        missing.remove("active");
        reject(fixture, missing.toString());
    }

    @Test
    void rejects_coerced_content_and_missing_snapshot_members() throws Exception {
        Fixture fixture = fixture("BOOLEAN", "NORMAL", "TENANT", "OVERRIDE", "false", false);
        for (String field : List.of("valueJson", "secretRef", "valueMode")) {
            for (String content : List.of("true", "42", "{}", "[]")) {
                ObjectNode snapshot = (ObjectNode) json(fixture.snapshot());
                snapshot.set(field, json(content));
                reject(fixture, snapshot.toString());
            }
            ObjectNode missing = (ObjectNode) json(fixture.snapshot());
            missing.remove(field);
            reject(fixture, missing.toString());
        }
        ObjectNode unknownMode = (ObjectNode) json(fixture.snapshot());
        unknownMode.put("valueMode", "UNKNOWN");
        reject(fixture, unknownMode.toString());
    }

    @Test
    void rejects_inconsistent_scope_and_audit_ownership() throws Exception {
        Fixture fixture = fixture("STRING", "NORMAL", "TENANT", "OVERRIDE", "\"old\"", false);
        for (Map.Entry<String, String> patch : Map.of("scopeType", "\"PRODUCT\"", "scopeCode", "\"TENANT:other\"",
                "scopeId", TENANT + ".0", "scopeReference", "\"EXTRA\"").entrySet()) {
            ObjectNode snapshot = (ObjectNode) json(fixture.snapshot());
            snapshot.set(patch.getKey(), json(patch.getValue()));
            reject(fixture, snapshot.toString());
        }
        for (String field : List.of("scopeType", "scopeCode", "scopeId", "scopeReference")) {
            ObjectNode snapshot = (ObjectNode) json(fixture.snapshot());
            snapshot.remove(field);
            reject(fixture, snapshot.toString());
        }
        jdbc.update("update RHN_SYS_PARAM_CHG set ID_TNT = null where ID_PARAM_CHG = ?", fixture.changeId());
        reject(fixture, fixture.snapshot());
    }

    @Test
    void rejects_ambiguous_or_absent_snapshot_documents() throws Exception {
        Fixture fixture = fixture("STRING", "NORMAL", "TENANT", "OVERRIDE", "\"old\"", false);
        for (String raw : List.of("", "null", "[]", "true", "{}", fixture.snapshot() + " {}",
                fixture.snapshot().replaceFirst("\\{", "{\"active\":false,"))) reject(fixture, raw);
        // Keep the table's at-least-one-snapshot invariant while exercising an absent restoration target.
        jdbc.update("update RHN_SYS_PARAM_CHG set JSON_BEFORE = ? where ID_PARAM_CHG = ?", fixture.snapshot(), fixture.changeId());
        reject(fixture, null);
    }

    @Test
    void restores_authentic_modes_contents_and_disabled_status_without_losing_precision() throws Exception {
        for (String mode : List.of("OVERRIDE", "INHERIT", "RESET_DEFAULT", "EXPLICIT_NULL")) {
            Fixture fixture = fixture("STRING", "NORMAL", "TENANT", mode, "\"\"", true);
            restore(fixture, fixture.revision(), UUID.randomUUID().toString()).andExpect(status().isOk())
                    .andExpect(jsonPath("$.values[0].sdParamValueMode").value(mode))
                    .andExpect(jsonPath("$.values[0].sdParamStatus").value("INACTIVE"));
            assertThat(jdbc.queryForObject("select JSON_VAL from RHN_SYS_PARAM_VAL where ID_PARAM_VAL = ?", String.class, fixture.valueId()))
                    .isEqualTo(mode.equals("OVERRIDE") ? "\"\"" : null);
        }
        for (String original : List.of("1.00000000000000000001", "1e400", "1e-400")) {
            Fixture fixture = fixture("NUMBER", "NORMAL", "PRODUCT", "OVERRIDE", original, false);
            restore(fixture, fixture.revision(), UUID.randomUUID().toString()).andExpect(status().isOk())
                    .andExpect(jsonPath("$.values[0].valueJson").value(original));
        }
    }

    @Test
    void restores_protected_content_from_internal_snapshot_without_leaking_it_in_response() throws Exception {
        for (String sensitivity : List.of("SENSITIVE", "SECRET")) {
            Fixture fixture = fixture("STRING", sensitivity, "TENANT", "OVERRIDE", "\"protected\"", false);
            restore(fixture, fixture.revision(), UUID.randomUUID().toString()).andExpect(status().isOk())
                    .andExpect(jsonPath("$.values[0].hasValue").value(true))
                    .andExpect(jsonPath("$.values[0].valueJson").doesNotExist());
            String column = sensitivity.equals("SECRET") ? "SECRET_REF" : "JSON_VAL";
            assertThat(jdbc.queryForObject("select " + column + " from RHN_SYS_PARAM_VAL where ID_PARAM_VAL = ?", String.class, fixture.valueId()))
                    .isEqualTo(sensitivity.equals("SECRET") ? "vault:original" : "\"protected\"");
        }
    }

    @Test
    void stale_revisions_and_idempotent_retries_preserve_the_existing_command_protocol() throws Exception {
        Fixture fixture = fixture("STRING", "NORMAL", "TENANT", "OVERRIDE", "\"old\"", false);
        String current = current(fixture).toString();
        long count = changeCount(fixture);
        restore(fixture, fixture.revision() - 1, UUID.randomUUID().toString()).andExpect(status().isConflict());
        assertThat(current(fixture).toString()).isEqualTo(current);
        assertThat(changeCount(fixture)).isEqualTo(count);
        String code = UUID.randomUUID().toString();
        restore(fixture, fixture.revision(), code).andExpect(status().isOk());
        String restored = current(fixture).toString();
        restore(fixture, fixture.revision(), code).andExpect(status().isOk());
        assertThat(current(fixture).toString()).isEqualTo(restored);
        assertThat(changeCount(fixture)).isEqualTo(count + 1);
    }

    private void reject(Fixture fixture, String snapshot) throws Exception {
        jdbc.update("update RHN_SYS_PARAM_CHG set JSON_AFTER = ? where ID_PARAM_CHG = ?", snapshot, fixture.changeId());
        String current = current(fixture).toString();
        long count = changeCount(fixture);
        String resolved = directory.resolveCurrent(Long.valueOf(TENANT), null, null, null, fixture.key()).value().toString();
        restore(fixture, fixture.revision(), UUID.randomUUID().toString()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PARAMETER_ROLLBACK_SNAPSHOT_INVALID"));
        assertThat(current(fixture).toString()).isEqualTo(current);
        assertThat(changeCount(fixture)).isEqualTo(count);
        assertThat(directory.resolveCurrent(Long.valueOf(TENANT), null, null, null, fixture.key()).value().toString()).isEqualTo(resolved);
    }

    private Fixture fixture(String type, String sensitivity, String scope, String mode, String original, boolean disabled) throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        String category = json(mockMvc.perform(post("/api/platform/configuration/categories").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(Map.of(
                                "code", "ROLLBACK_" + suffix.toUpperCase(), "name", "参数恢复测试", "sortOrder", 10))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("categoryId", category); body.put("key", "test.rollback." + suffix); body.put("name", "历史恢复");
        body.put("valueType", type); body.put("controlType", sensitivity.equals("SECRET") ? "SECRET_REFERENCE" : type.equals("NUMBER") ? "NUMBER" : type.equals("BOOLEAN") ? "SWITCH" : "TEXT");
        body.put("sensitivity", sensitivity); body.put("displayPolicy", sensitivity.equals("NORMAL") ? "PLAIN" : "HIDDEN");
        body.put("allowedScopes", List.of(scope)); body.put("category", "BUSINESS"); body.put("nullableValue", true);
        body.put("inheritanceEnabled", true); body.put("cacheEnabled", true); body.put("requestCode", UUID.randomUUID().toString());
        if (!sensitivity.equals("SECRET")) body.put("defaultValueJson", original);
        JsonNode definition = json(mockMvc.perform(post("/api/platform/configuration/definitions").with(rhn())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String id = definition.get("id").asString(), key = definition.get("key").asString(), code = UUID.randomUUID().toString();
        Map<String, Object> initial = new LinkedHashMap<>();
        initial.put("scopeType", scope); initial.put("valueMode", mode); initial.put("requestCode", code);
        if (scope.equals("PRODUCT")) initial.put("scopeReference", "TEST");
        if (mode.equals("OVERRIDE")) initial.put(sensitivity.equals("SECRET") ? "secretRef" : "valueJson", sensitivity.equals("SECRET") ? "vault:original" : original);
        JsonNode value = save(id, initial).get("values").get(0);
        String valueId = value.get("id").asString(); long revision = value.get("revision").asLong();
        if (disabled) {
            code = UUID.randomUUID().toString();
            value = json(mockMvc.perform(post("/api/platform/configuration/definitions/{id}/values/{valueId}/disable", id, valueId).with(rhn())
                    .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(Map.of("expectedRevision", revision, "requestCode", code))))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("values").get(0);
            revision = value.get("revision").asLong();
        }
        String changeId = jdbc.queryForObject("select ID_PARAM_CHG from RHN_SYS_PARAM_CHG where CD_REQ = ?", String.class, code);
        String snapshot = jdbc.queryForObject("select JSON_AFTER from RHN_SYS_PARAM_CHG where ID_PARAM_CHG = ?", String.class, changeId);
        initial.put("expectedRevision", revision); initial.put("valueMode", "OVERRIDE"); initial.put("requestCode", UUID.randomUUID().toString());
        initial.put(sensitivity.equals("SECRET") ? "secretRef" : "valueJson", sensitivity.equals("SECRET") ? "vault:current" : type.equals("NUMBER") ? "2" : type.equals("BOOLEAN") ? "true" : "\"current\"");
        value = save(id, initial).get("values").get(0);
        if (disabled) {
            value = json(mockMvc.perform(post("/api/platform/configuration/definitions/{id}/values/{valueId}/enable", id, valueId).with(rhn())
                    .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(Map.of("expectedRevision", value.get("revision").asLong(), "requestCode", UUID.randomUUID().toString()))))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("values").get(0);
        }
        return new Fixture(id, key, valueId, changeId, value.get("revision").asLong(), snapshot);
    }

    private JsonNode save(String id, Map<String, Object> body) throws Exception {
        return json(mockMvc.perform(put("/api/platform/configuration/definitions/{id}/values", id).with(rhn())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
    private ResultActions restore(Fixture fixture, long revision, String code) throws Exception {
        return mockMvc.perform(post("/api/platform/configuration/definitions/{id}/changes/{changeId}/rollback", fixture.id(), fixture.changeId()).with(rhn())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(Map.of("expectedRevision", revision, "requestCode", code, "reason", "恢复历史"))));
    }
    private JsonNode current(Fixture fixture) throws Exception {
        return json(mockMvc.perform(get("/api/platform/configuration/definitions/{id}", fixture.id()).with(rhn()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("values").get(0);
    }
    private long changeCount(Fixture fixture) { return jdbc.queryForObject("select count(*) from RHN_SYS_PARAM_CHG where ID_PARAM_DEF = ?", Long.class, fixture.id()); }
    private record Fixture(String id, String key, String valueId, String changeId, long revision, String snapshot) {}
}
