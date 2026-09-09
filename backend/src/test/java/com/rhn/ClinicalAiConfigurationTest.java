package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ClinicalAiConfigurationTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;

    @Test
    void encryptsTenantSecretsAndAppliesConfigurationWithoutRestart() throws Exception {
        mockMvc.perform(get("/api/ai/administration/configuration").param("scope", "TENANT").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scope").value("TENANT"))
                .andExpect(jsonPath("$.settings.length()").value(16))
                .andExpect(jsonPath("$.encryptionAvailable").value(true));

        JsonNode saved = json(mockMvc.perform(put("/api/ai/administration/configuration").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "scope":"TENANT",
                                  "reason":"验证租户级 AI 动态配置",
                                  "settings":[
                                    {"key":"mode","value":"MODEL"},
                                    {"key":"model","value":"tenant-clinical-model"},
                                    {"key":"endpoint","value":"https://tenant-ai.example/v1/chat/completions"},
                                    {"key":"api-key","secretValue":"tenant-secret-value"}
                                  ]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.runtime.mode").value("MODEL"))
                .andExpect(jsonPath("$.runtime.modelReady").value(true))
                .andExpect(jsonPath("$.settings[?(@.key == 'api-key')].secretConfigured").value(true))
                .andReturn().getResponse().getContentAsString());
        assertFalse(saved.toString().contains("tenant-secret-value"));

        String ciphertext = jdbc.queryForObject("""
                select v.SECRET_REF from RHN_SYS_PARAM_VAL v
                join RHN_SYS_PARAM_DEF d on d.ID_PARAM_DEF = v.ID_PARAM_DEF
                where d.CD_PARAM_KEY = 'ai.clinical.api-key' and v.CD_SCOPE = ?
                """, String.class, "TENANT:" + TENANT);
        assertNotNull(ciphertext);
        assertTrue(ciphertext.startsWith("enc:v1:test-development:"));
        assertFalse(ciphertext.contains("tenant-secret-value"));

        mockMvc.perform(get("/api/platform/configuration/values/{key}", "ai.clinical.api-key").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.secretReference").doesNotExist());
        mockMvc.perform(get("/api/ai/clinical-assistant/capabilities").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("MODEL"))
                .andExpect(jsonPath("$.model").value("tenant-clinical-model"))
                .andExpect(jsonPath("$.available").value(true));
    }

    @Test
    void supportsPlatformInheritanceAndRejectsOrganizationScope() throws Exception {
        mockMvc.perform(get("/api/ai/administration/configuration")
                        .param("scope", "ORGANIZATION").with(rhnWorkContext()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("AI_CONFIGURATION_SCOPE_RESTRICTED"));

        mockMvc.perform(put("/api/ai/administration/configuration").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"scope":"PLATFORM","settings":[
                                  {"key":"model","value":"platform-clinical-model"}
                                ]}
                                """))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/ai/administration/configuration").param("scope", "TENANT").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.settings[?(@.key == 'model')].effectiveValue")
                        .value("platform-clinical-model"))
                .andExpect(jsonPath("$.settings[?(@.key == 'model')].sourceScope").value("PLATFORM"));

        Long definitionId = jdbc.queryForObject(
                "select ID_PARAM_DEF from RHN_SYS_PARAM_DEF where CD_PARAM_KEY = 'ai.clinical.model'", Long.class);
        mockMvc.perform(put("/api/platform/configuration/definitions/{id}/values", definitionId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "scopeType":"ORGANIZATION",
                                  "scopeId":"362387869790211",
                                  "valueMode":"OVERRIDE",
                                  "valueJson":"\\\"forbidden\\\"",
                                  "requestCode":"ai-org-scope-test"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("AI_CONFIGURATION_SCOPE_RESTRICTED"));
    }
}
