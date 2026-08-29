package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class FoundationPlatformTest extends RhnIntegrationTestSupport {
    private static final String TENANT_DICTIONARY_CATEGORY = "9223009648984985598";

    @Test
    void parameter_definitions_validate_select_values_and_schema_types() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        String categoryId = createCategory("VALIDATION_" + suffix, "参数校验");

        mockMvc.perform(post("/api/platform/configuration/definitions")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","key":"business.status-%s","name":"业务状态",
                                 "valueType":"STRING","controlType":"SELECT","dictionaryCode":"PARAM_STATUS",
                                 "defaultValueJson":"\\\"UNKNOWN\\\"","allowedScopes":["TENANT"],
                                 "category":"BUSINESS","requestCode":"%s"}
                                """.formatted(categoryId, suffix.toLowerCase(), requestCode())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PARAMETER_DICTIONARY_VALUE_INVALID"));

        mockMvc.perform(post("/api/platform/configuration/definitions")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","key":"business.integer-%s","name":"整数参数",
                                 "valueType":"NUMBER","controlType":"NUMBER",
                                 "jsonSchema":"{\\\"type\\\":\\\"integer\\\"}","defaultValueJson":"1.5",
                                 "allowedScopes":["TENANT"],"category":"BUSINESS","requestCode":"%s"}
                                """.formatted(categoryId, suffix.toLowerCase(), requestCode())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PARAMETER_SCHEMA_VIOLATION"));

        mockMvc.perform(post("/api/platform/configuration/definitions")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","key":"business.object-%s","name":"对象参数",
                                 "valueType":"JSON","controlType":"JSON_EDITOR",
                                 "jsonSchema":"{\\\"type\\\":\\\"object\\\"}","defaultValueJson":"[]",
                                 "allowedScopes":["TENANT"],"category":"BUSINESS","requestCode":"%s"}
                                """.formatted(categoryId, suffix.toLowerCase(), requestCode())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PARAMETER_SCHEMA_VIOLATION"));

        String dictionaryCode = "TEST_BOOLEAN_" + suffix;
        JsonNode dictionary = json(mockMvc.perform(post("/api/platform/dictionaries")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"scopeType":"TENANT","categoryId":"%s","code":"%s","name":"布尔选项","requestCode":"%s"}
                                """.formatted(TENANT_DICTIONARY_CATEGORY, dictionaryCode, requestCode())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        String dictionaryId = dictionary.get("id").asText();
        addDictionaryItem(dictionaryId, 0, "TRUE", "是", 10);
        addDictionaryItem(dictionaryId, 1, "FALSE", "否", 20);

        String booleanKey = "business.boolean-" + suffix.toLowerCase();
        JsonNode booleanDefinition = json(mockMvc.perform(post("/api/platform/configuration/definitions")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","key":"%s","name":"布尔下拉参数",
                                 "valueType":"BOOLEAN","controlType":"SELECT","dictionaryCode":"%s",
                                 "defaultValueJson":"true","allowedScopes":["TENANT"],
                                 "category":"BUSINESS","requestCode":"%s"}
                                """.formatted(categoryId, booleanKey, dictionaryCode, requestCode())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(put("/api/platform/configuration/definitions/{id}/values",
                        booleanDefinition.get("id").asText())
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"scopeType":"TENANT","valueMode":"OVERRIDE","valueJson":"false",
                                 "requestCode":"%s"}
                                """.formatted(requestCode())))
                .andExpect(status().isOk());
        resolve(booleanKey).andExpect(status().isOk()).andExpect(jsonPath("$.value").value(false));
    }

    @Test
    void current_parameter_management_validates_logs_resets_and_rolls_back() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6);
        String categoryId = createCategory("OUTPATIENT_" + suffix.toUpperCase(), "门诊参数");
        String key = "outpatient.queue.max-" + suffix;
        String createRequest = requestCode();
        JsonNode definition = json(mockMvc.perform(post("/api/platform/configuration/definitions")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "categoryId":"%s",
                                  "key":"%s",
                                  "name":"门诊队列上限",
                                  "description":"控制单队列最大等待人数",
                                  "valueType":"NUMBER",
                                  "controlType":"NUMBER",
                                  "jsonSchema":"{\\\"minimum\\\":1,\\\"maximum\\\":100}",
                                  "defaultValueJson":"20",
                                  "exampleValueJson":"30",
                                  "unit":"人",
                                  "allowedScopes":["PLATFORM","TENANT","ORGANIZATION"],
                                  "category":"BUSINESS",
                                  "inheritanceEnabled":true,
                                  "cacheEnabled":true,
                                  "requestCode":"%s"
                                }
                                """.formatted(categoryId, key, createRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sdParamValueType").value("NUMBER"))
                .andExpect(jsonPath("$.sdParamValueTypeText").value("数值"))
                .andExpect(jsonPath("$.sdParamStatusText").value("已启用"))
                .andExpect(jsonPath("$.hasDefaultValue").value(true))
                .andExpect(jsonPath("$.hasExampleValue").value(true))
                .andExpect(jsonPath("$.revision").value(0))
                .andReturn().getResponse().getContentAsString());
        String definitionId = definition.get("id").asText();

        String saveRequest = requestCode();
        JsonNode withTenantValue = json(mockMvc.perform(put("/api/platform/configuration/definitions/{id}/values", definitionId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"scopeType":"TENANT","valueMode":"OVERRIDE","valueJson":"30",
                                 "reason":"建立租户基线","requestCode":"%s"}
                                """.formatted(saveRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.values[0].sdParamScopeTypeText").value("租户"))
                .andExpect(jsonPath("$.values[0].sdParamValueModeText").value("覆盖"))
                .andReturn().getResponse().getContentAsString());
        String valueId = withTenantValue.get("values").get(0).get("id").asText();

        mockMvc.perform(put("/api/platform/configuration/definitions/{id}/values", definitionId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"scopeType":"TENANT","valueMode":"OVERRIDE","valueJson":"99",
                                 "requestCode":"%s"}
                                """.formatted(saveRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.values[0].valueJson").value("30"));

        resolve(key).andExpect(status().isOk())
                .andExpect(jsonPath("$.value").value(30))
                .andExpect(jsonPath("$.resolvedScope").value("TENANT"))
                .andExpect(jsonPath("$.valueMode").value("OVERRIDE"));

        mockMvc.perform(put("/api/platform/configuration/definitions/{id}/values", definitionId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"scopeType":"ORGANIZATION","scopeId":"%s","valueMode":"OVERRIDE",
                                 "valueJson":"101","requestCode":"%s"}
                                """.formatted(ORGANIZATION, requestCode())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PARAMETER_SCHEMA_VIOLATION"));

        JsonNode reset = json(mockMvc.perform(put("/api/platform/configuration/definitions/{id}/values", definitionId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":"0","scopeType":"TENANT","valueMode":"RESET_DEFAULT",
                                 "reason":"恢复参数默认值","requestCode":"%s"}
                                """.formatted(requestCode())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.values[0].revision").value(1))
                .andReturn().getResponse().getContentAsString());

        resolve(key).andExpect(status().isOk())
                .andExpect(jsonPath("$.value").value(20))
                .andExpect(jsonPath("$.valueMode").value("RESET_DEFAULT"));

        JsonNode changes = json(mockMvc.perform(get("/api/platform/configuration/definitions/{id}/changes", definitionId)
                        .with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].sdParamChangeTypeText").value("恢复默认"))
                .andExpect(jsonPath("$[0].sdParamChangeTargetTypeText").value("参数当前值"))
                .andReturn().getResponse().getContentAsString());
        String originalValueChangeId = null;
        for (JsonNode change : changes) {
            if (change.hasNonNull("valueId") && "CREATE".equals(change.get("sdParamChangeType").asText())) {
                originalValueChangeId = change.get("id").asText();
            }
        }

        mockMvc.perform(post("/api/platform/configuration/definitions/{id}/changes/{changeId}/rollback",
                        definitionId, originalValueChangeId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":"%s","reason":"恢复已验证值","requestCode":"%s"}
                                """.formatted(reset.get("values").get(0).get("revision").asText(), requestCode())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.values[0].valueJson").value("30"))
                .andExpect(jsonPath("$.values[0].id").value(valueId));
    }

    private String createCategory(String code, String name) throws Exception {
        String body = mockMvc.perform(post("/api/platform/configuration/categories")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"%s","name":"%s","sortOrder":10}
                                """.formatted(code, name)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sdParamStatusText").value("已启用"))
                .andReturn().getResponse().getContentAsString();
        return json(body).get("id").asText();
    }

    private void addDictionaryItem(String dictionaryId, int revision, String code, String name,
                                   int sortOrder) throws Exception {
        mockMvc.perform(post("/api/platform/dictionaries/{id}/items", dictionaryId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":"%s","code":"%s","name":"%s","sortOrder":%s,
                                 "requestCode":"%s"}
                                """.formatted(revision, code, name, sortOrder, requestCode())))
                .andExpect(status().isCreated());
    }

    private org.springframework.test.web.servlet.ResultActions resolve(String key) throws Exception {
        return mockMvc.perform(get("/api/platform/configuration/values/{key}", key).with(rhn()));
    }

    private String requestCode() { return UUID.randomUUID().toString(); }
}
