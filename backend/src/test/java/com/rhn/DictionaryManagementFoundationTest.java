package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.context.annotation.Import;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(DictionaryManagementFoundationTest.DictionaryTranslationTestController.class)
class DictionaryManagementFoundationTest extends RhnIntegrationTestSupport {
    private static final String OTHER_TENANT = "362387869790210";
    private static final String PLATFORM_CATEGORY = "9223372036854775807";
    private static final String TENANT_CATEGORY = "9223009648984985598";

    @Test
    void dictionary_self_enums_are_read_only_complete_and_reserved_from_ordinary_dictionaries() throws Exception {
        mockMvc.perform(get("/api/platform/dictionaries/system-enums").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(32))
                .andExpect(jsonPath("$[0].code").value("DICT_SCOPE_TYPE"))
                .andExpect(jsonPath("$[0].items[0].code").value("PLATFORM"))
                .andExpect(jsonPath("$[0].items[1].code").value("TENANT"))
                .andExpect(jsonPath("$[1].code").value("DICT_STATUS"))
                .andExpect(jsonPath("$[2].code").value("DICT_CATEGORY_STATUS"))
                .andExpect(jsonPath("$[3].code").value("DICT_ITEM_STATUS"))
                .andExpect(jsonPath("$[4].code").value("DICT_CHANGE_TYPE"))
                .andExpect(jsonPath("$[4].items.length()").value(20))
                .andExpect(jsonPath("$[5].code").value("DICT_CHANGE_TARGET_TYPE"))
                .andExpect(jsonPath("$[6].code").value("PARAM_SCOPE_TYPE"))
                .andExpect(jsonPath("$[13].code").value("PARAM_VALUE_MODE"))
                .andExpect(jsonPath("$[15].code").value("PARAM_CHANGE_TARGET_TYPE"))
                .andExpect(jsonPath("$[24].code").value("SC_SCHEDULE_MANAGEMENT_MODE"))
                .andExpect(jsonPath("$[29].code").value("SC_QUOTA_MODE"))
                .andExpect(jsonPath("$[30].code").value("SC_VISIT_TYPE"))
                .andExpect(jsonPath("$[31].code").value("SC_RECEPTION_STATUS"));

        mockMvc.perform(get("/api/platform/dictionaries/system-enums/DICT_CHANGE_TYPE").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("字典变更类型"))
                .andExpect(jsonPath("$.items[0].name").value("创建分类"))
                .andExpect(jsonPath("$.items[13].code").value("DISABLE_ITEM"))
                .andExpect(jsonPath("$.items[19].code").value("CLEAR_ITEM_ATTRIBUTE"));

        mockMvc.perform(get("/api/platform/dictionaries/system-enums/UNKNOWN_ENUM").with(rhn()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("SYSTEM_ENUM_NOT_FOUND"));

        mockMvc.perform(get("/api/platform/dictionaries?query=ORG_TYPE").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].code").value("ORG_TYPE"))
                .andExpect(jsonPath("$[0].systemManaged").value(true))
                .andExpect(jsonPath("$[0].itemCount").value(9));

        mockMvc.perform(get("/api/platform/dictionaries?query=PARAM_SCOPE_TYPE").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].systemManaged").value(true))
                .andExpect(jsonPath("$[0].itemCount").value(8));

        mockMvc.perform(put("/api/platform/dictionaries/{id}", "362387869791012")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":"0","categoryId":"%s","name":"不可修改",
                                 "requestCode":"%s"}
                                """.formatted(PLATFORM_CATEGORY, requestCode())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("SYSTEM_DICTIONARY_READ_ONLY"));

        mockMvc.perform(post("/api/platform/dictionaries")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"scopeType":"PLATFORM","categoryId":"%s","code":"DICT_STATUS","name":"冲突字典",
                                 "requestCode":"%s"}
                                """.formatted(PLATFORM_CATEGORY, requestCode())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DICTIONARY_CODE_RESERVED"));
    }

    @Test
    void tenant_dictionary_enforces_revision_idempotency_isolation_and_append_only_changes() throws Exception {
        String code = "TEST_VISIT_TYPE_" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        String createRequest = requestCode();
        JsonNode created = json(mockMvc.perform(post("/api/platform/dictionaries")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "scopeType":"TENANT",
                                  "categoryId":"%s",
                                  "code":"%s",
                                  "name":"就诊类型",
                                  "description":"普通枚举字典",
                                  "reason":"建立字典基线",
                                  "requestCode":"%s"
                                }
                                """.formatted(TENANT_CATEGORY, code, createRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.revision").value(0))
                .andExpect(jsonPath("$.scopeCode").value("TENANT:" + TENANT))
                .andExpect(jsonPath("$.sdDictScopeType").value("TENANT"))
                .andExpect(jsonPath("$.sdDictScopeTypeText").value("租户私有"))
                .andExpect(jsonPath("$.sdDictStatus").value("ACTIVE"))
                .andExpect(jsonPath("$.sdDictStatusText").value("已启用"))
                .andReturn().getResponse().getContentAsString());
        String dictionaryId = created.get("id").asText();

        mockMvc.perform(post("/api/platform/dictionaries")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"scopeType":"TENANT","categoryId":"%s","code":"%s","name":"重复字典",
                                 "requestCode":"%s"}
                                """.formatted(TENANT_CATEGORY, code, requestCode())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DICTIONARY_CODE_DUPLICATE"));

        String addItemRequest = requestCode();
        mockMvc.perform(post("/api/platform/dictionaries/{id}/items", dictionaryId)
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":"0","code":"INITIAL","name":"初诊",
                                 "description":"首次就诊","sortOrder":10,"reason":"新增业务代码",
                                 "requestCode":"%s"}
                                """.formatted(addItemRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.items[0].code").value("INITIAL"));

        mockMvc.perform(post("/api/platform/dictionaries/{id}/items", dictionaryId)
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":"0","code":"FOLLOW_UP","name":"复诊",
                                 "sortOrder":20,"requestCode":"%s"}
                                """.formatted(requestCode())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DICTIONARY_REVISION_CONFLICT"));

        mockMvc.perform(post("/api/platform/dictionaries/{id}/items", dictionaryId)
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":"0","code":"IGNORED_ON_REPLAY","name":"重放",
                                 "sortOrder":99,"requestCode":"%s"}
                                """.formatted(addItemRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.items.length()").value(1));

        String itemId = json(mockMvc.perform(get("/api/platform/dictionaries/{id}", dictionaryId).with(rhn()))
                .andReturn().getResponse().getContentAsString()).get("items").get(0).get("id").asText();
        mockMvc.perform(post("/api/platform/dictionaries/{id}/items/{itemId}/disable", dictionaryId, itemId)
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":"1","reason":"停止用于新业务",
                                 "requestCode":"%s"}
                                """.formatted(requestCode())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(2))
                .andExpect(jsonPath("$.items[0].sdDictItemStatus").value("INACTIVE"))
                .andExpect(jsonPath("$.items[0].sdDictItemStatusText").value("已停用"));

        mockMvc.perform(get("/api/platform/dictionaries/{id}/changes", dictionaryId).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].sdDictChangeType").value("DISABLE_ITEM"))
                .andExpect(jsonPath("$[0].sdDictChangeTypeText").value("停用字典项"))
                .andExpect(jsonPath("$[0].sdDictChangeTargetType").value("ITEM"))
                .andExpect(jsonPath("$[0].sdDictChangeTargetTypeText").value("字典项"))
                .andExpect(jsonPath("$[0].before.status").value("ACTIVE"))
                .andExpect(jsonPath("$[0].after.status").value("INACTIVE"))
                .andExpect(jsonPath("$[1].sdDictChangeType").value("ADD_ITEM"))
                .andExpect(jsonPath("$[2].sdDictChangeType").value("CREATE_DICT"));

        mockMvc.perform(get("/api/platform/dictionaries/{id}", dictionaryId).with(rhn(OTHER_TENANT)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("DICTIONARY_NOT_FOUND"));
    }

    @Test
    void platform_dictionary_is_visible_to_all_tenants_and_resolution_returns_only_active_items() throws Exception {
        String code = "TEST_PLATFORM_LEVEL_" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        JsonNode created = json(mockMvc.perform(post("/api/platform/dictionaries")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"scopeType":"PLATFORM","categoryId":"%s","code":"%s","name":"平台等级",
                                 "requestCode":"%s"}
                                """.formatted(PLATFORM_CATEGORY, code, requestCode())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        String dictionaryId = created.get("id").asText();

        mockMvc.perform(post("/api/platform/dictionaries/{id}/items", dictionaryId)
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":"0","code":"NORMAL","name":"普通",
                                 "sortOrder":10,"requestCode":"%s"}
                                """.formatted(requestCode())))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/platform/dictionaries/resolve/{code}", code).with(rhn(OTHER_TENANT)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].code").value("NORMAL"))
                .andExpect(jsonPath("$[0].name").value("普通"));
    }

    @Test
    void dictionary_categories_support_tree_governance_dictionary_move_and_audit() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        JsonNode root = json(mockMvc.perform(post("/api/platform/dictionaries/categories")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"scopeType":"TENANT","code":"TEST_ROOT_%s","name":"业务分类",
                                 "description":"分类根节点","sortOrder":10,"reason":"建立分类",
                                 "requestCode":"%s"}
                                """.formatted(suffix, requestCode())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.revision").value(0))
                .andExpect(jsonPath("$.scopeCode").value("TENANT:" + TENANT))
                .andExpect(jsonPath("$.sdDictCategoryStatus").value("ACTIVE"))
                .andReturn().getResponse().getContentAsString());
        String rootId = root.get("id").asText();

        JsonNode child = json(mockMvc.perform(post("/api/platform/dictionaries/categories")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"scopeType":"TENANT","parentId":"%s","code":"TEST_CHILD_%s",
                                 "name":"诊疗业务","sortOrder":20,"requestCode":"%s"}
                                """.formatted(rootId, suffix, requestCode())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.parentId").value(Long.parseLong(rootId)))
                .andReturn().getResponse().getContentAsString());
        String childId = child.get("id").asText();

        JsonNode dictionary = json(mockMvc.perform(post("/api/platform/dictionaries")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"scopeType":"TENANT","categoryId":"%s","code":"TEST_CAT_DICT_%s",
                                 "name":"分类测试字典","requestCode":"%s"}
                                """.formatted(childId, suffix, requestCode())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.categoryId").value(Long.parseLong(childId)))
                .andExpect(jsonPath("$.categoryName").value("诊疗业务"))
                .andReturn().getResponse().getContentAsString());
        String dictionaryId = dictionary.get("id").asText();

        mockMvc.perform(get("/api/platform/dictionaries")
                        .param("categoryId", rootId).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(dictionaryId))
                .andExpect(jsonPath("$[0].categoryId").value(childId));

        mockMvc.perform(put("/api/platform/dictionaries/{id}", dictionaryId)
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":"0","categoryId":"%s","name":"分类测试字典",
                                 "reason":"调整归属分类","requestCode":"%s"}
                                """.formatted(rootId, requestCode())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.categoryId").value(Long.parseLong(rootId)));

        mockMvc.perform(get("/api/platform/dictionaries/{id}/changes", dictionaryId).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].sdDictChangeType").value("MOVE_DICT"))
                .andExpect(jsonPath("$[0].categoryId").value(Long.parseLong(rootId)))
                .andExpect(jsonPath("$[0].sdDictChangeTargetType").value("DICT"));

        mockMvc.perform(put("/api/platform/dictionaries/categories/{id}", rootId)
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":"0","parentId":"%s","name":"业务分类",
                                 "sortOrder":10,"requestCode":"%s"}
                                """.formatted(childId, requestCode())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DICTIONARY_CATEGORY_CYCLE"));

        mockMvc.perform(post("/api/platform/dictionaries/categories/{id}/disable", rootId)
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":"0","reason":"校验占用约束","requestCode":"%s"}
                                """.formatted(requestCode())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DICTIONARY_CATEGORY_IN_USE"));

        mockMvc.perform(get("/api/platform/dictionaries/categories/{id}/changes", rootId).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].sdDictChangeType").value("CREATE_CATEGORY"))
                .andExpect(jsonPath("$[0].sdDictChangeTargetType").value("CATEGORY"));
    }

    @Test
    void planned_dictionary_taxonomy_groups_the_platform_baseline_by_business_domain() throws Exception {
        mockMvc.perform(get("/api/platform/dictionaries/categories").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code == 'PLATFORM_GOVERNANCE')].name").value("平台治理"))
                .andExpect(jsonPath("$[?(@.code == 'COMMON_DICTIONARIES')].dictionaryCount").value(4))
                .andExpect(jsonPath("$[?(@.code == 'PARAMETER_GOVERNANCE')].dictionaryCount").value(10))
                .andExpect(jsonPath("$[?(@.code == 'ORGANIZATION_GOVERNANCE')].dictionaryCount").value(13))
                .andExpect(jsonPath("$[?(@.code == 'DEPARTMENT_GOVERNANCE')].dictionaryCount").value(6))
                .andExpect(jsonPath("$[?(@.code == 'PERSONNEL_GOVERNANCE')].dictionaryCount").value(5))
                .andExpect(jsonPath("$[?(@.code == 'MASTER_DATA_GOVERNANCE')].dictionaryCount").value(3))
                .andExpect(jsonPath("$[?(@.code == 'CLINICAL_SERVICE')].dictionaryCount").value(4))
                .andExpect(jsonPath("$[?(@.code == 'MEDICATION')].dictionaryCount").value(4))
                .andExpect(jsonPath("$[?(@.code == 'PRODUCT_SUPPLY')].dictionaryCount").value(6))
                .andExpect(jsonPath("$[?(@.code == 'DIAGNOSTICS')].dictionaryCount").value(5));

        mockMvc.perform(get("/api/platform/dictionaries").param("query", "ORG_TYPE").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].categoryCode").value("ORGANIZATION_GOVERNANCE"));
        mockMvc.perform(get("/api/platform/dictionaries").param("query", "ORG_DEPARTMENT_TYPE").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].categoryCode").value("DEPARTMENT_GOVERNANCE"));
        mockMvc.perform(get("/api/platform/dictionaries").param("query", "PARAM_SCOPE_TYPE").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].categoryCode").value("PARAMETER_GOVERNANCE"));
        mockMvc.perform(get("/api/platform/dictionaries").param("query", "COMMON_YES_NO").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].categoryCode").value("COMMON_DICTIONARIES"))
                .andExpect(jsonPath("$[0].systemManaged").value(true))
                .andExpect(jsonPath("$[0].itemCount").value(2));
        mockMvc.perform(get("/api/platform/dictionaries").param("query", "BD_DOSE_FORM").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].categoryCode").value("MEDICATION"));

        mockMvc.perform(get("/api/platform/dictionaries")
                        .param("categoryId", "362387869840000").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(40));
        mockMvc.perform(get("/api/platform/dictionaries")
                        .param("categoryId", "362387869796000").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(22));

        mockMvc.perform(get("/api/platform/dictionaries/resolve/{code}", "COMMON_YES_NO").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].code").value("YES"))
                .andExpect(jsonPath("$[0].name").value("是"))
                .andExpect(jsonPath("$[1].code").value("NO"))
                .andExpect(jsonPath("$[1].name").value("否"));
    }

    @Test
    void ordinary_dictionary_text_is_inferred_cached_invalidated_and_kept_for_inactive_items() throws Exception {
        JsonNode created = json(mockMvc.perform(post("/api/platform/dictionaries")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"scopeType":"TENANT","categoryId":"%s","code":"TEST_TRANSLATION","name":"翻译测试",
                                 "requestCode":"%s"}
                                """.formatted(TENANT_CATEGORY, requestCode())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        String dictionaryId = created.get("id").asText();

        JsonNode withItem = json(mockMvc.perform(post("/api/platform/dictionaries/{id}/items", dictionaryId)
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":"0","code":"VALUE","name":"初始文本",
                                 "sortOrder":10,"requestCode":"%s"}
                                """.formatted(requestCode())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        String itemId = withItem.get("items").get(0).get("id").asText();

        mockMvc.perform(get("/api/test/dictionary-translation").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sdTestTranslation").value("VALUE"))
                .andExpect(jsonPath("$.sdTestTranslationText").value("初始文本"));

        mockMvc.perform(put("/api/platform/dictionaries/{id}/items/{itemId}", dictionaryId, itemId)
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":"1","name":"更新文本","sortOrder":10,
                                 "requestCode":"%s"}
                                """.formatted(requestCode())))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/platform/dictionaries/{id}/items/{itemId}/disable", dictionaryId, itemId)
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":"2","requestCode":"%s"}
                                """.formatted(requestCode())))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/test/dictionary-translation").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sdTestTranslationText").value("更新文本"));
    }

    @RestController
    static class DictionaryTranslationTestController {
        @GetMapping("/api/test/dictionary-translation")
        DictionaryTranslationTestResponse response() {
            return new DictionaryTranslationTestResponse("VALUE");
        }
    }

    record DictionaryTranslationTestResponse(String sdTestTranslation) {
    }

    private String requestCode() {
        return UUID.randomUUID().toString();
    }
}
