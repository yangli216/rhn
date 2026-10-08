package com.rhn;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.platform.configuration.infrastructure.ConfigurationValueCache;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ParameterContentIntegrityTest extends RhnIntegrationTestSupport {
    @Autowired ConfigurationDirectory directory;
    @Autowired ConfigurationValueCache cache;
    @Autowired JdbcTemplate jdbc;

    @Test
    void preserves_decimal_defaults_overrides_and_cached_runtime_values() throws Exception {
        String original = "0.12345678901234567890123456789";
        Definition definition = definition("NUMBER", null, original);
        assertThat(resolve(definition).decimalValue()).isEqualByComparingTo(new BigDecimal(original));
        for (String value : List.of("9007199254740993.00000000000000001", "1e400", "1e-400")) {
            Long revision = jdbc.queryForObject("select max(REVISION) from RHN_SYS_PARAM_VAL where ID_PARAM_DEF = ?", Long.class, definition.id());
            JsonNode saved = json(save(definition, value, revision).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
            assertThat(saved.get("values").get(0).get("valueJson").asString()).isEqualTo(value);
            assertThat(resolve(definition).decimalValue()).isEqualByComparingTo(new BigDecimal(value));
            assertThat(resolve(definition).decimalValue()).isEqualByComparingTo(new BigDecimal(value));
        }
    }

    @Test
    void rejects_a_precisely_out_of_range_override_without_mutating_value_or_audit() throws Exception {
        String maximum = "1.00000000000000000001";
        Definition definition = definition("NUMBER", "{\"maximum\":" + maximum + "}", "1");
        save(definition, maximum, null).andExpect(status().isOk());
        long changes = changeCount(definition);
        save(definition, "1.00000000000000000002", 0L).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PARAMETER_SCHEMA_VIOLATION"));
        assertThat(jdbc.queryForObject("select JSON_VAL from RHN_SYS_PARAM_VAL where ID_PARAM_DEF = ?", String.class, definition.id())).isEqualTo(maximum);
        assertThat(changeCount(definition)).isEqualTo(changes);
    }

    @Test
    void does_not_round_a_tiny_minimum_to_zero() throws Exception {
        Definition definition = definition("NUMBER", "{\"minimum\":1e-400}", null);
        save(definition, "0", null).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PARAMETER_SCHEMA_VIOLATION"));
        save(definition, "1e-400", null).andExpect(status().isOk());
        assertThat(resolve(definition).decimalValue()).isEqualByComparingTo(new BigDecimal("1e-400"));
    }

    @Test
    void distinguishes_high_precision_enum_members() throws Exception {
        Definition definition = definition("NUMBER", "{\"enum\":[1.00000000000000000001]}", null);
        save(definition, "1.00000000000000000002", null).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PARAMETER_SCHEMA_VIOLATION"));
        save(definition, "1.00000000000000000001", null).andExpect(status().isOk());
    }

    @Test
    void rejects_duplicate_keys_trailing_roots_and_incomplete_values_without_audit_writes() throws Exception {
        Definition definition = definition("JSON", null, "{}");
        long changes = changeCount(definition);
        for (String value : List.of("{\"limit\":1,\"limit\":2}", "{\"outer\":{\"a\":1,\"\\u0061\":2}}", "{} []", " ")) {
            save(definition, value, null).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("PARAMETER_JSON_INVALID"));
        }
        assertThat(changeCount(definition)).isEqualTo(changes);
        assertThat(jdbc.queryForObject("select count(*) from RHN_SYS_PARAM_VAL where ID_PARAM_DEF = ?", Long.class, definition.id())).isZero();
    }

    @Test
    void rejects_ambiguous_schema_and_default_before_creating_a_definition() throws Exception {
        create("NUMBER", "{\"maximum\":1,\"maximum\":2}", null).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PARAMETER_JSON_INVALID"));
        create("JSON", null, "{\"a\":1,\"a\":2}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PARAMETER_JSON_INVALID"));
    }

    @Test
    void compares_large_length_constraints_without_integer_wraparound() throws Exception {
        Definition minimum = definition("STRING", "{\"minLength\":4294967296}", null);
        save(minimum, "\"abc\"", null).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PARAMETER_SCHEMA_VIOLATION"));
        Definition maximum = definition("STRING", "{\"maxLength\":4294967296}", null);
        save(maximum, "\"abc\"", null).andExpect(status().isOk());
        create("STRING", "{\"minLength\":-4294967296}", null).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PARAMETER_SCHEMA_INVALID"));
        create("STRING", "{\"minLength\":4294967297,\"maxLength\":4294967296}", null).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PARAMETER_SCHEMA_INVALID"));
    }

    @Test
    void does_not_cache_a_successful_resolution_for_ambiguous_historical_content() throws Exception {
        Definition definition = definition("JSON", null, "{}");
        save(definition, "{\"a\":1}", null).andExpect(status().isOk());
        jdbc.update("update RHN_SYS_PARAM_VAL set JSON_VAL = ? where ID_PARAM_DEF = ?", "{\"a\":1,\"a\":2}", definition.id());
        cache.invalidateAll();
        BusinessException failure = assertThrows(BusinessException.class, () -> resolve(definition));
        assertThat(failure.code()).isEqualTo("PARAMETER_JSON_INVALID");
        jdbc.update("update RHN_SYS_PARAM_VAL set JSON_VAL = ? where ID_PARAM_DEF = ?", "{\"a\":1.00000000000000000001}", definition.id());
        assertThat(resolve(definition).get("a").decimalValue()).isEqualByComparingTo(new BigDecimal("1.00000000000000000001"));
    }

    private ResultActions create(String type, String schema, String defaultValue) throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        String category = json(mockMvc.perform(post("/api/platform/configuration/categories").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(Map.of(
                                "code", "PREC_" + suffix.toUpperCase(), "name", "参数精确性测试", "sortOrder", 10))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("categoryId", category); body.put("key", "test.precision." + suffix); body.put("name", "参数精确性");
        body.put("valueType", type); body.put("controlType", type.equals("JSON") ? "JSON_EDITOR" : type.equals("NUMBER") ? "NUMBER" : "TEXT");
        body.put("allowedScopes", List.of("TENANT")); body.put("category", "BUSINESS");
        body.put("cacheEnabled", true); body.put("inheritanceEnabled", true); body.put("requestCode", UUID.randomUUID().toString());
        if (schema != null) body.put("jsonSchema", schema);
        if (defaultValue != null) body.put("defaultValueJson", defaultValue);
        return mockMvc.perform(post("/api/platform/configuration/definitions").with(rhn())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body)));
    }

    private Definition definition(String type, String schema, String defaultValue) throws Exception {
        JsonNode result = json(create(type, schema, defaultValue).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return new Definition(result.get("id").asString(), result.get("key").asString());
    }

    private ResultActions save(Definition definition, String value, Long revision) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("scopeType", "TENANT"); body.put("valueMode", "OVERRIDE"); body.put("valueJson", value);
        body.put("requestCode", UUID.randomUUID().toString());
        if (revision != null) body.put("expectedRevision", revision);
        return mockMvc.perform(put("/api/platform/configuration/definitions/{id}/values", definition.id()).with(rhn())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body)));
    }

    private JsonNode resolve(Definition definition) {
        return directory.resolveCurrent(Long.valueOf(TENANT), null, null, null, definition.key()).value();
    }

    private long changeCount(Definition definition) {
        return jdbc.queryForObject("select count(*) from RHN_SYS_PARAM_CHG where ID_PARAM_DEF = ?", Long.class, definition.id());
    }

    private record Definition(String id, String key) {}
}
