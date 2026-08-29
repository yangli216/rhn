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

class DictionaryAttributeConfigurationTest extends RhnIntegrationTestSupport {
    private static final String PAY_METHOD = "362387869852001";
    private static final String CASH = "362387869852101";
    private static final String BANK_CARD = "362387869852102";
    private static final String AVAILABLE_SCENE = "362387869852201";

    @Test
    void payment_scene_attribute_allows_an_organization_to_expand_then_restore_the_platform_value() throws Exception {
        mockMvc.perform(get("/api/platform/dictionaries/{id}/attributes", PAY_METHOD).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].code").value("AVAILABLE_SCENE"))
                .andExpect(jsonPath("$[0].minimumScope").value("ORGANIZATION"))
                .andExpect(jsonPath("$[0].overridePolicy").value("ANY"))
                .andExpect(jsonPath("$[0].referenceOptions.length()").value(3));

        mockMvc.perform(get("/api/platform/dictionaries/{id}/item-attribute-configurations", PAY_METHOD)
                        .param("scopeType", "ORGANIZATION").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(6))
                .andExpect(jsonPath("$[?(@.itemCode == 'CASH')].attributes[0].resolved.sourceLabel")
                        .value("全局"))
                .andExpect(jsonPath("$[?(@.itemCode == 'CASH')].attributes[0].resolved.values.length()")
                        .value(2))
                .andExpect(jsonPath("$[?(@.itemCode == 'BANK_CARD')].attributes[0].resolved.values.length()")
                        .value(3));

        mockMvc.perform(get("/api/platform/dictionaries/resolve/PAY_METHOD/applicable")
                        .param("attributeCode", "AVAILABLE_SCENE")
                        .param("referenceCode", "SELF_SERVICE").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code == 'CASH')]").isEmpty());

        long revision = dictionaryRevision();
        mockMvc.perform(put("/api/platform/dictionaries/{id}/items/{itemId}/attributes/{attributeId}/values",
                        PAY_METHOD, CASH, AVAILABLE_SCENE).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedDictionaryRevision":%d,"scopeType":"ORGANIZATION",
                                 "valueMode":"OVERRIDE","values":["CLINIC_SETTLE","CASHIER","SELF_SERVICE"],
                                 "reason":"机构支付场景独立配置","requestCode":"%s"}
                                """.formatted(revision, UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes[0].configured.scopeType").value("ORGANIZATION"))
                .andExpect(jsonPath("$.attributes[0].configured.values.length()").value(3))
                .andExpect(jsonPath("$.attributes[0].resolved.values.length()").value(3));

        mockMvc.perform(get("/api/platform/dictionaries/resolve/PAY_METHOD/applicable")
                        .param("attributeCode", "AVAILABLE_SCENE")
                        .param("referenceCode", "SELF_SERVICE").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code == 'CASH')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.code == 'CASH')].resolvedScopeCode")
                        .value("TENANT:" + TENANT + "/ORG:" + ORGANIZATION));

        mockMvc.perform(post("/api/platform/dictionaries/{id}/items/{itemId}/attributes/{attributeId}/inherit",
                        PAY_METHOD, CASH, AVAILABLE_SCENE).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedDictionaryRevision":%d,"scopeType":"ORGANIZATION",
                                 "reason":"恢复平台配置","requestCode":"%s"}
                                """.formatted(dictionaryRevision(), UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes[0].configured").doesNotExist())
                .andExpect(jsonPath("$.attributes[0].resolved.scopeType").value("PLATFORM"));

        mockMvc.perform(get("/api/platform/dictionaries/resolve/PAY_METHOD/applicable")
                        .param("attributeCode", "AVAILABLE_SCENE")
                        .param("referenceCode", "SELF_SERVICE").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code == 'CASH')]").isEmpty());
    }

    @Test
    void administrator_can_select_an_explicit_organization_target_without_switching_work_context() throws Exception {
        long revision = dictionaryRevision();
        mockMvc.perform(put("/api/platform/dictionaries/{id}/items/{itemId}/attributes/{attributeId}/values",
                        PAY_METHOD, BANK_CARD, AVAILABLE_SCENE).with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedDictionaryRevision":%d,"scopeType":"ORGANIZATION",
                                 "organizationId":"%s",
                                 "valueMode":"OVERRIDE","values":["CLINIC_SETTLE"],
                                 "reason":"为指定机构配置支付场景","requestCode":"%s"}
                                """.formatted(revision, ORGANIZATION, UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.editingScope").value("ORGANIZATION"))
                .andExpect(jsonPath("$.editingScopeCode")
                        .value("TENANT:" + TENANT + "/ORG:" + ORGANIZATION))
                .andExpect(jsonPath("$.attributes[0].configured.organizationId").value(ORGANIZATION))
                .andExpect(jsonPath("$.attributes[0].resolved.values[0].referenceItemCode").value("CLINIC_SETTLE"));

        mockMvc.perform(get("/api/platform/dictionaries/{id}/items/{itemId}/attributes", PAY_METHOD, BANK_CARD)
                        .param("scopeType", "ORGANIZATION")
                        .param("organizationId", ORGANIZATION).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes[0].configured.scopeType").value("ORGANIZATION"));

        mockMvc.perform(post("/api/platform/dictionaries/{id}/items/{itemId}/attributes/{attributeId}/inherit",
                        PAY_METHOD, BANK_CARD, AVAILABLE_SCENE).with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedDictionaryRevision":%d,"scopeType":"ORGANIZATION",
                                 "organizationId":"%s",
                                 "reason":"测试后恢复继承","requestCode":"%s"}
                                """.formatted(dictionaryRevision(), ORGANIZATION, UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes[0].configured").doesNotExist());
    }

    private long dictionaryRevision() throws Exception {
        JsonNode detail = json(mockMvc.perform(get("/api/platform/dictionaries/{id}", PAY_METHOD).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        return detail.get("revision").asLong();
    }
}
