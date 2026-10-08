package com.rhn;

import com.rhn.ai.api.ClinicalAssistantContracts.DiagnosisInput;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ClinicalAiPlanIdentityTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;

    @Test void exactRecommendationsRequireFullIdentityAndResolveActualCatalogConcepts() throws Exception {
        String encounter = encounter();
        String western = plan("362387869795011", "I10", "原发性高血压", "WESTERN_MEDICINE");
        String tcm = plan("362387869795067", "XK_BING", "消渴病", "TCM_DISEASE");
        for (String identity : new String[]{"", "\"diagnosisDomain\":\"WESTERN_MEDICINE\",",
                "\"codeSystem\":\"WHO.BD.CS.ICD10\",",
                "\"codeSystem\":\"RHN.BD.CS.TCM_DISEASE\",\"diagnosisDomain\":\"TCM_DISEASE\","}) {
            assertFalse(hasPlan(recommend(encounter, identity, "I10", 200), western), identity);
        }
        var known = recommend(encounter,
                "\"codeSystem\":\"WHO.BD.CS.ICD10\",\"diagnosisDomain\":\"WESTERN_MEDICINE\",", "I10", 200);
        assertTrue(hasPlan(known, western));
        assertTrue(known.toString().contains("完整诊断标识匹配"));
        var catalog = recommend(encounter, "\"conceptId\":\"362387869795067\",", "XK_BING", 200);
        assertTrue(hasPlan(catalog, tcm));
        assertFalse(hasPlan(catalog, western));
        assertTrue(catalog.toString().contains("完整诊断标识匹配"));
        for (String identity : new String[]{
                "\"conceptId\":\"362387869795067\",\"diagnosisDomain\":\"WESTERN_MEDICINE\",",
                "\"conceptId\":\"362387869795067\",\"codeSystem\":\"WHO.BD.CS.ICD10\","}) {
            assertEquals("AI_DIAGNOSIS_IDENTITY_MISMATCH", recommend(encounter, identity, "XK_BING", 400).path("code").asString());
        }
        assertEquals("AI_DIAGNOSIS_IDENTITY_MISMATCH", recommend(encounter,
                "\"conceptId\":\"362387869795067\",", "I10", 400).path("code").asString());
    }

    @Test void localAssistantDoesNotInventWesternCandidatesForUnknownOrOtherSystems() throws Exception {
        String encounter = encounter();
        for (String identity : new String[]{"",
                "\"codeSystem\":\"RHN.BD.CS.TCM_DISEASE\",\"diagnosisDomain\":\"TCM_DISEASE\","}) {
            var suggestion = json(mockMvc.perform(post("/api/ai/clinical-assistant/encounters/{id}/suggestions", encounter)
                    .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(request(identity, "I10")))
                    .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
            assertTrue(suggestion.path("diagnosisCandidates").isEmpty());
            assertTrue(suggestion.path("safetyAlerts").toString().contains("诊断未进入自动候选"));
            assertEquals(0, jdbc.queryForObject("select count(*) from RHN_VIS_ENC_DIAG where ID_TNT=? and ID_ENC=?",
                    Integer.class, Long.valueOf(TENANT), Long.valueOf(encounter)));
        }
    }

    @Test void legacyInputSerializationDoesNotInventIdentity() {
        var unknown = objectMapper.valueToTree(new DiagnosisInput("I10", "诊断", "PRIMARY"));
        assertEquals(3, unknown.size());
        assertFalse(unknown.has("conceptId"));
        assertFalse(unknown.has("codeSystem"));
        assertFalse(unknown.has("diagnosisDomain"));
    }

    @Test void runtimeContractPreservesIdentityWithoutCollidingWithEncounterDiagnosisInput() throws Exception {
        String document = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var schemas = json(document).path("components").path("schemas");
        assertEquals("#/components/schemas/ClinicalAssistantDiagnosisInput", schemas.path("ClinicalAssistantDraft")
                .path("properties").path("diagnoses").path("items").path("$ref").asString());
        for (String field : new String[]{"conceptId", "codeSystem", "diagnosisDomain"}) {
            assertTrue(schemas.path("ClinicalAssistantDiagnosisInput").path("properties").has(field), field);
        }
        assertTrue(schemas.path("DiagnosisInput").path("properties").has("diagnosisGroupId"));
        String export = System.getProperty("rhn.plan-retrieval.openapi-export");
        if (export != null) java.nio.file.Files.writeString(java.nio.file.Path.of(export), document);
    }

    private boolean hasPlan(JsonNode plans, String id) {
        for (var plan : plans) if (id.equals(plan.path("templateId").asString())) return true;
        return false;
    }

    private JsonNode recommend(String encounter, String identity, String code, int expected) throws Exception {
        return json(mockMvc.perform(post("/api/ai/clinical-assistant/encounters/{id}/plan-recommendations", encounter)
                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(request(identity, code)))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString());
    }

    private String request(String identity, String code) {
        return """
                {"clientContextFingerprint":"%s","draft":{"chiefComplaint":"待核对条目",
                 "diagnoses":[{%s"code":"%s","display":"待核对条目","type":"PRIMARY"}]}}
                """.formatted(UUID.randomUUID(), identity, code);
    }

    private String plan(String concept, String code, String display, String domain) throws Exception {
        return json(mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"scopeType":"PERSONAL","name":"IDENTITY-%s","diagnoses":[{"conceptId":"%s",
                 "diagnosisDomain":"%s","code":"%s","display":"%s","type":"PRIMARY"}],"medications":[],"services":[]}
                """.formatted(UUID.randomUUID(), concept, domain, code, display)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asString();
    }

    private String encounter() throws Exception {
        String resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"fullName":"辅诊身份测试","gender":"FEMALE","birthDate":"1988-08-08",
                 "identifiers":[{"system":"9","value":"%s","useType":"SECONDARY"}]}
                """.formatted(UUID.randomUUID())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asString();
        String encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"residentId":"%s","organizationId":"%s","departmentId":"%s","idempotencyCode":"%s"}
                """.formatted(resident, ORGANIZATION, DEPARTMENT, UUID.randomUUID())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asString();
        mockMvc.perform(verifiedEncounterStart(encounter)).andExpect(status().isOk());
        return encounter;
    }
}
