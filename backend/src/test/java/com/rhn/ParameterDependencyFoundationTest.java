package com.rhn;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.platform.configuration.api.ConfigurationValue;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ParameterDependencyFoundationTest extends RhnIntegrationTestSupport {

    @Autowired
    ConfigurationDirectory configurationDirectory;

    @Test
    void rejects_self_dependency_and_non_existent_dependency() throws Exception {
        String suffix = suffix();
        String categoryId = createCategory("DEP_VAL_" + suffix);
        String key = "test.dep.self-" + suffix.toLowerCase();

        // Self-dependency
        mockMvc.perform(post("/api/platform/configuration/definitions")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","key":"%s","name":"自依赖测试",
                                 "valueType":"STRING","controlType":"TEXT",
                                 "allowedScopes":["PLATFORM","TENANT"],"category":"BUSINESS",
                                 "dependsOnKey":"%s","dependsOnValue":"true",
                                 "requestCode":"%s"}
                                """.formatted(categoryId, key, key, requestCode())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PARAMETER_DEPENDENCY_SELF"));

        // Non-existent parent
        mockMvc.perform(post("/api/platform/configuration/definitions")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","key":"%s","name":"依赖不存在测试",
                                 "valueType":"STRING","controlType":"TEXT",
                                 "allowedScopes":["PLATFORM","TENANT"],"category":"BUSINESS",
                                 "dependsOnKey":"non.existent.key","dependsOnValue":"true",
                                 "requestCode":"%s"}
                                """.formatted(categoryId, key, requestCode())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PARAMETER_DEPENDENCY_NOT_FOUND"));
    }

    @Test
    void rejects_circular_dependency_chains() throws Exception {
        String suffix = suffix();
        String categoryId = createCategory("CYCLE_" + suffix);
        String keyA = "test.cycle.a-" + suffix.toLowerCase();
        String keyB = "test.cycle.b-" + suffix.toLowerCase();

        String idA = createDefinition(categoryId, keyA, "节点A", null, null);
        String idB = createDefinition(categoryId, keyB, "节点B", keyA, "true");

        // Update A to depend on B -> forms cycle A -> B -> A
        mockMvc.perform(put("/api/platform/configuration/definitions/{id}", idA)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":0,"categoryId":"%s","key":"%s","name":"节点A更新",
                                 "valueType":"STRING","controlType":"TEXT",
                                 "allowedScopes":["PLATFORM","TENANT"],"category":"BUSINESS",
                                 "dependsOnKey":"%s","dependsOnValue":"true",
                                 "requestCode":"%s"}
                                """.formatted(categoryId, keyA, keyB, requestCode())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PARAMETER_DEPENDENCY_CYCLE"));
    }

    @Test
    void resolves_child_parameter_as_suppressed_when_parent_dependency_is_not_satisfied() throws Exception {
        String suffix = suffix();
        String categoryId = createCategory("RUNTIME_" + suffix);
        String parentKey = "test.switch.master-" + suffix.toLowerCase();
        String childKey = "test.child.endpoint-" + suffix.toLowerCase();

        // 1. Create parent switch (boolean) with default false
        String parentId = createBooleanDefinition(categoryId, parentKey, "总开关", "false");
        // 2. Create child endpoint (string) with default "https://api.example.com", depending on parent = "true"
        String childId = createDefinition(categoryId, childKey, "子服务地址", parentKey, "true");
        saveValue(childId, "TENANT", null, null, "\"https://custom.endpoint.com\"", null);

        // 3. Parent switch is currently false -> child parameter should be SUPPRESSED at runtime
        ConfigurationValue suppressed = configurationDirectory.resolveCurrent(
                Long.valueOf(TENANT), null, null, null, childKey);
        assertTrue(suppressed.suppressedByDependency());
        assertNull(suppressed.value());

        // 4. Detail API exposes dependency info and dependencySatisfied = false
        mockMvc.perform(get("/api/platform/configuration/definitions/{id}", childId).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dependsOnKey").value(parentKey))
                .andExpect(jsonPath("$.dependsOnValue").value("true"))
                .andExpect(jsonPath("$.dependsOnName").value("总开关"))
                .andExpect(jsonPath("$.dependencySatisfied").value(false));

        // 5. Turn on parent switch (set to true)
        saveValue(parentId, "TENANT", null, null, "true", null);

        // 6. Child parameter should now be active and resolve its configured value
        ConfigurationValue active = configurationDirectory.resolveCurrent(
                Long.valueOf(TENANT), null, null, null, childKey);
        assertFalse(active.suppressedByDependency());
        assertEquals("https://custom.endpoint.com", active.value().asString());

        // 7. Detail API now reports dependencySatisfied = true
        mockMvc.perform(get("/api/platform/configuration/definitions/{id}", childId).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dependencySatisfied").value(true));
    }

    private String createCategory(String code) throws Exception {
        String body = mockMvc.perform(post("/api/platform/configuration/categories")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"%s","name":"依赖测试分类","sortOrder":100}
                                """.formatted(code)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json(body).get("id").asString();
    }

    private String createDefinition(String categoryId, String key, String name,
                                    String dependsOnKey, String dependsOnValue) throws Exception {
        String depFields = dependsOnKey == null ? "" : """
                ,"dependsOnKey":"%s","dependsOnValue":"%s","dependencyBehavior":"DISABLE_AND_SUPPRESS"
                """.formatted(dependsOnKey, dependsOnValue);
        String body = mockMvc.perform(post("/api/platform/configuration/definitions")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","key":"%s","name":"%s",
                                 "valueType":"STRING","controlType":"TEXT",
                                 "allowedScopes":["PLATFORM","TENANT"],"category":"BUSINESS",
                                 "requestCode":"%s"%s}
                                """.formatted(categoryId, key, name, requestCode(), depFields)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json(body).get("id").asString();
    }

    private String createBooleanDefinition(String categoryId, String key, String name, String defaultValue) throws Exception {
        String body = mockMvc.perform(post("/api/platform/configuration/definitions")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","key":"%s","name":"%s",
                                 "valueType":"BOOLEAN","controlType":"SWITCH",
                                 "defaultValueJson":"%s",
                                 "allowedScopes":["PLATFORM","TENANT"],"category":"BUSINESS",
                                 "requestCode":"%s"}
                                """.formatted(categoryId, key, name, defaultValue, requestCode())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json(body).get("id").asString();
    }

    private JsonNode saveValue(String definitionId, String scope, String scopeId,
                               String organizationId, String value, Long expectedRevision) throws Exception {
        String scopeField = scopeId == null ? "" : ",\"scopeId\":\"" + scopeId + "\"";
        String organizationField = organizationId == null ? "" : ",\"organizationId\":\"" + organizationId + "\"";
        String revisionField = expectedRevision == null ? "" : ",\"expectedRevision\":\"" + expectedRevision + "\"";
        String escapedValue = value.replace("\"", "\\\"");
        String body = mockMvc.perform(put("/api/platform/configuration/definitions/{id}/values", definitionId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"scopeType":"%s","valueMode":"OVERRIDE","valueJson":"%s",
                                 "reason":"依赖生效测试","requestCode":"%s"%s%s%s}
                                """.formatted(scope, escapedValue, requestCode(), scopeField, organizationField, revisionField)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json(body);
    }

    private String suffix() { return UUID.randomUUID().toString().substring(0, 6).toUpperCase(); }
    private String requestCode() { return UUID.randomUUID().toString(); }
}
