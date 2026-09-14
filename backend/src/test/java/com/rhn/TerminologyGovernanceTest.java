package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TerminologyGovernanceTest extends RhnIntegrationTestSupport {

    @Test
    void migrated_value_set_is_available_under_the_governed_key() throws Exception {
        mockMvc.perform(get("/api/platform/terminology/value-sets/{code}/expand",
                        "RHN.PI.VS.RESIDENT.GENDER")
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].system").value("RHN.COMMON.CS.GENDER"))
                .andExpect(jsonPath("$[0].systemVersion").value("2026.01"))
                .andExpect(jsonPath("$[*].code").value(org.hamcrest.Matchers.contains(
                        "MALE", "FEMALE", "UNKNOWN")));
    }

    @Test
    void terminology_management_rejects_legacy_and_cross_scope_keys() throws Exception {
        mockMvc.perform(post("/api/platform/terminology/code-systems")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "productScope": true,
                                  "code": "RHN.GENDER",
                                  "name": "旧式性别代码",
                                  "canonicalUri": "urn:rhn:codesystem:legacy-gender",
                                  "version": "2026.08",
                                  "effectiveFrom": "2026-08-01"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.violations[0].field").value("code"));

        mockMvc.perform(post("/api/platform/terminology/code-systems")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "productScope": false,
                                  "code": "RHN.VIS.CS.DIAGNOSIS",
                                  "name": "租户诊断代码",
                                  "canonicalUri": "urn:rhn:tenant:diagnosis",
                                  "version": "2026.08",
                                  "effectiveFrom": "2026-08-01"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_ARGUMENT"));

        mockMvc.perform(post("/api/platform/terminology/value-sets")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "productScope": false,
                                  "code": "RHN.VIS.VS.ENCOUNTER.GENDER",
                                  "name": "不存在的产品值域覆盖",
                                  "version": "2026.08",
                                  "effectiveFrom": "2026-08-01"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALUE_SET_PRODUCT_BASE_REQUIRED"));
    }

    @Test
    void local_code_system_preserves_source_concept_codes() throws Exception {
        String response = mockMvc.perform(post("/api/platform/terminology/code-systems")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "productScope": false,
                                  "code": "LOCAL.VIS.CS.DIAGNOSIS",
                                  "name": "租户历史诊断编码体系",
                                  "canonicalUri": "urn:rhn:local:diagnosis",
                                  "version": "2026.08",
                                  "effectiveFrom": "2026-08-01"
                                }
                                """))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String codeSystemId = objectMapper.readTree(response).get("id").asString();

        mockMvc.perform(post("/api/platform/terminology/code-systems/{id}/concepts", codeSystemId)
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "code": "Legacy-01",
                                  "display": "历史诊断代码一",
                                  "effectiveFrom": "2026-08-01"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("Legacy-01"));
    }
}
