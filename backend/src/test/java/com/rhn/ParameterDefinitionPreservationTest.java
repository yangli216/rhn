package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ParameterDefinitionPreservationTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;

    @Test
    void preserves_protected_examples_on_rename_and_replaces_only_explicitly_supplied_content() throws Exception {
        for (String sensitivity : List.of("SECRET", "SENSITIVE")) {
            Map<String, Object> body = body(sensitivity);
            Definition definition = create(body);
            body.remove("exampleValueJson"); body.remove("defaultValueJson"); body.put("name", "仅修改名称");
            update(definition, body, 0).andExpect(status().isOk())
                    .andExpect(jsonPath("$.hasExampleValue").value(true))
                    .andExpect(jsonPath("$.exampleValueJson").doesNotExist());
            assertThat(stored(definition, "JSON_EXAMPLE_VAL")).isEqualTo("\"example-reference\"");
            assertThat(stored(definition, "UNIT")).isEqualTo("次");
            body.put("exampleValueJson", "\"replacement-reference\"");
            update(definition, body, 1).andExpect(status().isOk())
                    .andExpect(jsonPath("$.hasExampleValue").value(true))
                    .andExpect(jsonPath("$.exampleValueJson").doesNotExist());
            assertThat(stored(definition, "JSON_EXAMPLE_VAL")).isEqualTo("\"replacement-reference\"");
            if (sensitivity.equals("SECRET")) {
                body.put("defaultValueJson", "\"forbidden-default\"");
                update(definition, body, 2).andExpect(status().isBadRequest())
                        .andExpect(jsonPath("$.code").value("PARAMETER_SECRET_DEFAULT_FORBIDDEN"));
                assertThat(stored(definition, "JSON_DEFAULT_VAL")).isNull();
            } else {
                assertThat(stored(definition, "JSON_DEFAULT_VAL")).isEqualTo("\"protected-default\"");
            }
        }
    }

    @Test
    void switching_a_protected_definition_to_secret_removes_default_without_erasing_the_hidden_example() throws Exception {
        Map<String, Object> body = body("SENSITIVE");
        Definition definition = create(body);
        body.put("sensitivity", "SECRET"); body.put("controlType", "SECRET_REFERENCE");
        body.remove("defaultValueJson"); body.remove("exampleValueJson");
        update(definition, body, 0).andExpect(status().isOk())
                .andExpect(jsonPath("$.hasDefaultValue").value(false))
                .andExpect(jsonPath("$.hasExampleValue").value(true));
        assertThat(stored(definition, "JSON_DEFAULT_VAL")).isNull();
        assertThat(stored(definition, "JSON_EXAMPLE_VAL")).isEqualTo("\"example-reference\"");
    }

    @Test
    void ordinary_metadata_can_be_preserved_and_explicitly_cleared_without_confusing_empty_strings_with_absence() throws Exception {
        for (String defaultValue : List.of("\"\"", "\"   \"")) {
            Map<String, Object> body = body("NORMAL");
            body.put("displayPolicy", "PLAIN"); body.put("defaultValueJson", defaultValue);
            Definition definition = create(body);
            body.put("name", "保留单位及示例");
            update(definition, body, 0).andExpect(status().isOk())
                    .andExpect(jsonPath("$.defaultValueJson").value(defaultValue))
                    .andExpect(jsonPath("$.hasDefaultValue").value(true))
                    .andExpect(jsonPath("$.unit").value("次"))
                    .andExpect(jsonPath("$.exampleValueJson").value("\"example-reference\""));
            body.remove("defaultValueJson"); body.remove("exampleValueJson"); body.remove("unit");
            update(definition, body, 1).andExpect(status().isOk())
                    .andExpect(jsonPath("$.hasDefaultValue").value(false))
                    .andExpect(jsonPath("$.hasExampleValue").value(false))
                    .andExpect(jsonPath("$.unit").doesNotExist());
        }
    }

    private Map<String, Object> body(String sensitivity) throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        String category = json(mockMvc.perform(post("/api/platform/configuration/categories").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(Map.of(
                                "code", "PRESERVE_" + suffix.toUpperCase(), "name", "参数保留测试", "sortOrder", 10))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("categoryId", category); result.put("key", "test.preserve." + suffix); result.put("name", "参数资料");
        result.put("valueType", "STRING"); result.put("controlType", sensitivity.equals("SECRET") ? "SECRET_REFERENCE" : "TEXT");
        result.put("sensitivity", sensitivity); result.put("displayPolicy", "HIDDEN"); result.put("allowedScopes", List.of("TENANT"));
        result.put("category", "BUSINESS"); result.put("unit", "次"); result.put("exampleValueJson", "\"example-reference\"");
        if (!sensitivity.equals("SECRET")) result.put("defaultValueJson", "\"protected-default\"");
        return result;
    }

    private Definition create(Map<String, Object> body) throws Exception {
        body.put("requestCode", UUID.randomUUID().toString());
        JsonNode result = json(mockMvc.perform(post("/api/platform/configuration/definitions").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return new Definition(result.get("id").asString());
    }

    private ResultActions update(Definition definition, Map<String, Object> body, long revision) throws Exception {
        body.put("expectedRevision", revision); body.put("requestCode", UUID.randomUUID().toString());
        return mockMvc.perform(put("/api/platform/configuration/definitions/{id}", definition.id()).with(rhn())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body)));
    }

    private String stored(Definition definition, String column) {
        return jdbc.queryForObject("select " + column + " from RHN_SYS_PARAM_DEF where ID_PARAM_DEF = ?", String.class, definition.id());
    }

    private record Definition(String id) {}
}
