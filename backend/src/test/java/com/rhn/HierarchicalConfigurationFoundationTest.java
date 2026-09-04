package com.rhn;

import com.rhn.platform.configuration.infrastructure.ConfigurationValueCache;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class HierarchicalConfigurationFoundationTest extends RhnIntegrationTestSupport {
    private static final String OTHER_TENANT = "362387869790210";

    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired ConfigurationValueCache valueCache;

    @Test
    void reorders_parameter_categories_as_one_validated_tree_change() throws Exception {
        String suffix = suffix();
        JsonNode first = json(mockMvc.perform(post("/api/platform/configuration/categories")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"TREE_FIRST_%s","name":"树节点一","sortOrder":10}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode second = json(mockMvc.perform(post("/api/platform/configuration/categories")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"TREE_SECOND_%s","name":"树节点二","sortOrder":20}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode child = json(mockMvc.perform(post("/api/platform/configuration/categories")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"parentId":"%s","code":"TREE_CHILD_%s","name":"子节点","sortOrder":10}
                                """.formatted(first.get("id").asText(), suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());

        JsonNode reordered = json(mockMvc.perform(put("/api/platform/configuration/categories/reorder")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categories":[
                                  {"id":"%s","expectedRevision":0,"sortOrder":10},
                                  {"id":"%s","expectedRevision":0,"sortOrder":20},
                                  {"id":"%s","expectedRevision":0,"parentId":"%s","sortOrder":10}
                                ]}
                                """.formatted(second.get("id").asText(), first.get("id").asText(),
                                child.get("id").asText(), second.get("id").asText())))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode movedChild = findById(reordered, child.get("id").asText());
        JsonNode movedSecond = findById(reordered, second.get("id").asText());
        assertEquals(second.get("id").asText(), movedChild.get("parentId").asText());
        assertEquals(10, movedSecond.get("sortOrder").asInt());

        mockMvc.perform(put("/api/platform/configuration/categories/reorder")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categories":[
                                  {"id":"%s","expectedRevision":%s,"parentId":"%s","sortOrder":10},
                                  {"id":"%s","expectedRevision":%s,"parentId":"%s","sortOrder":10}
                                ]}
                                """.formatted(second.get("id").asText(), movedSecond.get("revision").asText(),
                                child.get("id").asText(), child.get("id").asText(), movedChild.get("revision").asText(),
                                second.get("id").asText())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PARAMETER_CATEGORY_CYCLE"));
    }

    @Test
    void resolves_same_type_parents_before_broader_scopes_and_invalidates_cache() throws Exception {
        String suffix = suffix();
        String childOrganizationId = createOrganization(ORGANIZATION, "PARAM-CHILD-ORG-" + suffix);
        String parentDepartmentId = createDepartment(childOrganizationId, null, "PARAM-PARENT-DEPT-" + suffix);
        String childDepartmentId = createDepartment(childOrganizationId, parentDepartmentId,
                "PARAM-CHILD-DEPT-" + suffix);
        Long userId = createUser("parameter-hierarchy-" + suffix.toLowerCase());
        String categoryId = createCategory("HIERARCHY_" + suffix);
        String key = "system.hierarchy.timeout-" + suffix.toLowerCase();
        String definitionId = createDefinition(categoryId, key, "SYSTEM", true, true,
                "[\"PLATFORM\",\"TENANT\",\"ORGANIZATION\",\"DEPARTMENT\",\"USER\"]");

        saveValue(definitionId, "PLATFORM", null, null, "10", null);
        saveValue(definitionId, "TENANT", null, null, "20", null);
        saveValue(definitionId, "ORGANIZATION", ORGANIZATION, null, "30", null);
        saveValue(definitionId, "DEPARTMENT", parentDepartmentId, childOrganizationId, "40", null);
        saveValue(definitionId, "USER", userId.toString(), null, "50", null);

        resolve(key, null, childOrganizationId, null, TENANT)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.value").value(30))
                .andExpect(jsonPath("$.resolvedScope").value("ORGANIZATION"))
                .andExpect(jsonPath("$.resolvedScopeId").value(ORGANIZATION))
                .andExpect(jsonPath("$.inherited").value(true));

        resolve(key, null, childOrganizationId, childDepartmentId, TENANT)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.value").value(40))
                .andExpect(jsonPath("$.resolvedScope").value("DEPARTMENT"))
                .andExpect(jsonPath("$.resolvedScopeId").value(parentDepartmentId));

        resolve(key, userId.toString(), childOrganizationId, childDepartmentId, TENANT)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.value").value(50))
                .andExpect(jsonPath("$.resolvedScope").value("USER"))
                .andExpect(jsonPath("$.inherited").value(false));

        resolve(key, null, null, null, TENANT)
                .andExpect(status().isOk()).andExpect(jsonPath("$.value").value(20));
        resolve(key, null, null, null, OTHER_TENANT)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.value").value(10))
                .andExpect(jsonPath("$.resolvedScope").value("PLATFORM"));
        mockMvc.perform(get("/api/platform/configuration/definitions/{id}", definitionId).with(rhn(OTHER_TENANT)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.values.length()").value(1))
                .andExpect(jsonPath("$.values[0].sdParamScopeType").value("PLATFORM"));

        valueCache.invalidateAll();
        long hitsBefore = valueCache.hitCount();
        resolve(key, null, childOrganizationId, null, TENANT).andExpect(status().isOk());
        resolve(key, null, childOrganizationId, null, TENANT).andExpect(status().isOk());
        assertTrue(valueCache.hitCount() > hitsBefore);
        assertTrue(valueCache.estimatedSize() > 0);

        JsonNode childValue = saveValue(definitionId, "ORGANIZATION", childOrganizationId,
                null, "35", null);
        assertEquals(0, valueCache.estimatedSize());
        resolve(key, null, childOrganizationId, null, TENANT)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.value").value(35))
                .andExpect(jsonPath("$.resolvedScopeId").value(childOrganizationId));
        assertEquals(0, childValue.get("values").get(0).get("revision").asInt());
    }

    @Test
    void non_inheritable_values_are_exact_and_secret_parameters_store_only_references() throws Exception {
        String suffix = suffix();
        String childOrganizationId = createOrganization(ORGANIZATION, "PARAM-LOCAL-ORG-" + suffix);
        String categoryId = createCategory("LOCAL_" + suffix);
        String key = "business.local.only-" + suffix.toLowerCase();
        String definitionId = createDefinition(categoryId, key, "BUSINESS", false, false,
                "[\"ORGANIZATION\"]");

        saveValue(definitionId, "ORGANIZATION", ORGANIZATION, null, "99", null);
        resolve(key, null, childOrganizationId, null, TENANT)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PARAMETER_VALUE_NOT_FOUND"));

        saveValue(definitionId, "ORGANIZATION", childOrganizationId, null, "88", null);
        valueCache.invalidateAll();
        long hitsBefore = valueCache.hitCount();
        resolve(key, null, childOrganizationId, null, TENANT)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.value").value(88))
                .andExpect(jsonPath("$.inherited").value(false));
        resolve(key, null, childOrganizationId, null, TENANT).andExpect(status().isOk());
        assertEquals(hitsBefore, valueCache.hitCount());

        String secretKey = "system.secret.reference-" + suffix.toLowerCase();
        String secretDefinition = createSecretDefinition(categoryId, secretKey);
        mockMvc.perform(put("/api/platform/configuration/definitions/{id}/values", secretDefinition)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"scopeType":"TENANT","valueMode":"OVERRIDE",
                                 "secretRef":"vault://rhn/payment-key","reason":"绑定秘密管理引用",
                                 "requestCode":"%s"}
                                """.formatted(requestCode())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.values[0].valueJson").doesNotExist())
                .andExpect(jsonPath("$.values[0].displayValue").value("******"))
                .andExpect(jsonPath("$.values[0].secretReference").value(true));

        mockMvc.perform(get("/api/platform/configuration/definitions/{id}/changes", secretDefinition).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].after.valueJson").isEmpty())
                .andExpect(jsonPath("$[0].after.secretRef").value("vault://rhn/payment-key"));
    }

    @Test
    void sensitive_parameters_are_masked_and_protected_defaults_survive_definition_updates() throws Exception {
        String suffix = suffix();
        String categoryId = createCategory("SENSITIVE_" + suffix);
        String key = "system.sensitive.notice-" + suffix.toLowerCase();

        mockMvc.perform(post("/api/platform/configuration/definitions")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","key":"%s-rejected","name":"不安全敏感参数",
                                 "valueType":"STRING","controlType":"TEXT","allowedScopes":["TENANT"],
                                 "category":"SYSTEM","sensitivity":"SENSITIVE","displayPolicy":"PLAIN",
                                 "requestCode":"%s"}
                                """.formatted(categoryId, key, requestCode())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PARAMETER_SENSITIVE_DISPLAY_FORBIDDEN"));

        JsonNode definition = json(mockMvc.perform(post("/api/platform/configuration/definitions")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","key":"%s","name":"敏感通知参数",
                                 "valueType":"STRING","controlType":"TEXT",
                                 "defaultValueJson":"\\\"受保护默认值\\\"","exampleValueJson":"\\\"示例\\\"",
                                 "allowedScopes":["TENANT"],"category":"SYSTEM",
                                 "sensitivity":"SENSITIVE","displayPolicy":"MASKED",
                                 "requestCode":"%s"}
                                """.formatted(categoryId, key, requestCode())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.defaultValueJson").doesNotExist())
                .andExpect(jsonPath("$.hasDefaultValue").value(true))
                .andReturn().getResponse().getContentAsString());
        String definitionId = definition.get("id").asText();

        mockMvc.perform(put("/api/platform/configuration/definitions/{id}/values", definitionId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"scopeType":"TENANT","valueMode":"OVERRIDE",
                                 "valueJson":"\\\"敏感当前值\\\"","requestCode":"%s"}
                                """.formatted(requestCode())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.values[0].valueJson").doesNotExist())
                .andExpect(jsonPath("$.values[0].displayValue").value("******"));

        mockMvc.perform(get("/api/platform/configuration/definitions/{id}/changes", definitionId).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].after.valueJson").isEmpty());

        JsonNode updated = json(mockMvc.perform(put("/api/platform/configuration/definitions/{id}", definitionId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":"0","categoryId":"%s","key":"%s","name":"敏感通知参数（更新）",
                                 "valueType":"STRING","controlType":"TEXT","allowedScopes":["TENANT"],
                                 "category":"SYSTEM","sensitivity":"SENSITIVE","displayPolicy":"MASKED",
                                 "requestCode":"%s"}
                                """.formatted(categoryId, key, requestCode())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasDefaultValue").value(true))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(put("/api/platform/configuration/definitions/{id}/values", definitionId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":"0","scopeType":"TENANT","valueMode":"RESET_DEFAULT",
                                 "requestCode":"%s"}
                                """.formatted(requestCode())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(updated.get("revision").asLong()));
        resolve(key, null, null, null, TENANT)
                .andExpect(status().isOk()).andExpect(jsonPath("$.value").value("受保护默认值"));
    }

    private String createCategory(String code) throws Exception {
        return json(mockMvc.perform(post("/api/platform/configuration/categories")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"%s","name":"参数测试分类","sortOrder":10}
                                """.formatted(code)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private JsonNode findById(JsonNode array, String id) {
        for (JsonNode item : array) if (id.equals(item.get("id").asText())) return item;
        throw new AssertionError("未找到分类 " + id);
    }

    private String createDefinition(String categoryId, String key, String category,
                                    boolean inheritanceEnabled, boolean cacheEnabled,
                                    String allowedScopes) throws Exception {
        String body = mockMvc.perform(post("/api/platform/configuration/definitions")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","key":"%s","name":"层级参数测试",
                                 "valueType":"NUMBER","controlType":"NUMBER","defaultValueJson":"5",
                                 "allowedScopes":%s,"category":"%s","inheritanceEnabled":%s,
                                 "cacheEnabled":%s,"requestCode":"%s"}
                                """.formatted(categoryId, key, allowedScopes, category,
                                inheritanceEnabled, cacheEnabled, requestCode())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json(body).get("id").asText();
    }

    private String createSecretDefinition(String categoryId, String key) throws Exception {
        String body = mockMvc.perform(post("/api/platform/configuration/definitions")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":"%s","key":"%s","name":"支付密钥引用",
                                 "valueType":"STRING","controlType":"SECRET_REFERENCE",
                                 "allowedScopes":["TENANT"],"category":"SYSTEM",
                                 "sensitivity":"SECRET","displayPolicy":"MASKED",
                                 "requestCode":"%s"}
                                """.formatted(categoryId, key, requestCode())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json(body).get("id").asText();
    }

    private JsonNode saveValue(String definitionId, String scope, String scopeId,
                               String organizationId, String value, Long expectedRevision) throws Exception {
        String scopeField = scopeId == null ? "" : ",\"scopeId\":\"" + scopeId + "\"";
        String organizationField = organizationId == null ? "" : ",\"organizationId\":\"" + organizationId + "\"";
        String revisionField = expectedRevision == null ? "" : ",\"expectedRevision\":\"" + expectedRevision + "\"";
        String body = mockMvc.perform(put("/api/platform/configuration/definitions/{id}/values", definitionId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"scopeType":"%s","valueMode":"OVERRIDE","valueJson":"%s",
                                 "reason":"层级解析测试","requestCode":"%s"%s%s%s}
                                """.formatted(scope, value, requestCode(), scopeField, organizationField, revisionField)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json(body);
    }

    private ResultActions resolve(String key, String userId, String organizationId,
                                  String departmentId, String tenantId) throws Exception {
        var request = get("/api/platform/configuration/values/{key}", key).with(rhn(tenantId));
        if (userId != null) request.queryParam("userId", userId);
        if (organizationId != null) request.queryParam("organizationId", organizationId);
        if (departmentId != null) request.queryParam("departmentId", departmentId);
        return mockMvc.perform(request);
    }

    private String createOrganization(String parentId, String code) throws Exception {
        return json(mockMvc.perform(post("/api/platform/organizations")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"parentId":"%s","code":"%s","name":"参数测试子机构",
                                 "type":"CLINIC","validFrom":"2026-01-01"}
                                """.formatted(parentId, code)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private String createDepartment(String organizationId, String parentId, String code) throws Exception {
        String parentField = parentId == null ? "" : ",\"parentId\":\"" + parentId + "\"";
        return json(mockMvc.perform(post("/api/platform/departments")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"organizationId":"%s","code":"%s","name":"参数测试科室",
                                 "type":"CLINICAL","validFrom":"2026-01-01"%s}
                                """.formatted(organizationId, code, parentField)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private Long createUser(String username) {
        Long userId = com.rhn.shared.id.GlobalIds.next();
        Instant now = Instant.now();
        jdbcTemplate.update("""
                insert into RHN_SYS_USER_ACCT
                    (ID_USER, ID_TNT, CD_USERNAME, HASH_PASSWORD, SD_STATUS, DT_CREATED, DT_UPDATED, REVISION)
                values (?, cast(? as bigint), ?, '{noop}unused', 'ACTIVE', ?, ?, 0)
                """, userId, TENANT, username, now, now);
        return userId;
    }

    private String suffix() { return UUID.randomUUID().toString().substring(0, 6).toUpperCase(); }
    private String requestCode() { return UUID.randomUUID().toString(); }
}
