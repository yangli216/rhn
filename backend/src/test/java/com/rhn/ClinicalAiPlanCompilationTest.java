package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class ClinicalAiPlanCompilationTest extends RhnIntegrationTestSupport {

    @Test
    void natural_input_is_compiled_to_plan_draft_and_can_be_persisted_as_hospital_plan() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        String name = "AI高血压指南方-" + suffix;

        // 1. Test AI natural language compilation
        String draftJson = mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/draft")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "naturalInput": "高血压规范管理方案，开硝苯地平控释片，查心电图",
                                  "scopeType": "HOSPITAL"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scopeType").value("HOSPITAL"))
                .andExpect(jsonPath("$.sourceType").value("AI_INPUT"))
                .andExpect(jsonPath("$.diagnoses[0].code").value("I10"))
                .andReturn().getResponse().getContentAsString();

        JsonNode compiledDraft = json(draftJson);

        // 2. Persist as HOSPITAL template
        String templateId = json(mockMvc.perform(post("/api/outpatient/plan-templates")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "scopeType":"HOSPITAL",
                                  "name":"%s",
                                  "description":"%s",
                                  "sourceType":"AI_INPUT",
                                  "diagnoses":%s,
                                  "medications":[],
                                  "services":[]
                                }
                                """.formatted(name, compiledDraft.get("description").asString(),
                                compiledDraft.get("diagnoses").toString())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.scopeType").value("HOSPITAL"))
                .andExpect(jsonPath("$.sourceType").value("AI_INPUT"))
                .andReturn().getResponse().getContentAsString()).get("id").asString();

        // 3. Verify it is visible in current context
        mockMvc.perform(get("/api/outpatient/plan-templates").with(rhnWorkContext()).param("keyword", suffix))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(Long.valueOf(templateId)))
                .andExpect(jsonPath("$[0].scopeType").value("HOSPITAL"));
    }

    @Test
    void primary_care_upper_respiratory_infection_plan_compiles_and_persists_without_invalid_codes() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        String name = "基层成人上感常用方案-" + suffix;

        // 1. Verify compilation maps correctly to J06.9 instead of invalid Z00.0
        String draftJson = mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/draft")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "naturalInput": "基层成人上呼吸感染常用方案",
                                  "scopeType": "PERSONAL"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sourceType").value("AI_INPUT"))
                .andExpect(jsonPath("$.diagnoses[0].code").value("J06.9"))
                .andExpect(jsonPath("$.diagnoses[0].display").value("急性上呼吸道感染，未特指"))
                .andReturn().getResponse().getContentAsString();

        JsonNode compiledDraft = json(draftJson);

        // 2. Persist to outpatient plan template repository (verifies real ICD-10 term check passes!)
        mockMvc.perform(post("/api/outpatient/plan-templates")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "scopeType":"PERSONAL",
                                  "name":"%s",
                                  "description":"%s",
                                  "sourceType":"AI_INPUT",
                                  "diagnoses":%s,
                                  "medications":[],
                                  "services":[]
                                }
                                """.formatted(name, compiledDraft.get("description").asString(),
                                compiledDraft.get("diagnoses").toString())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.diagnoses[0].code").value("J06.9"));
    }

    @Test
    void guideline_text_is_compiled_with_metadata_and_mined_suggestions_work() throws Exception {
        // 1. Compile guideline text
        mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/guideline-extract")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "guidelineText": "根据国家基层高血压防治指南，一级高血压患者首选单药治疗，如硝苯地平控释片，常规检查心电图与生化",
                                  "guidelineName": "中国高血压防治指南2026",
                                  "versionYear": "2026",
                                  "scopeType": "HOSPITAL"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scopeType").value("HOSPITAL"))
                .andExpect(jsonPath("$.sourceType").value("AI_GUIDELINE"))
                .andExpect(jsonPath("$.name").value("中国高血压防治指南2026"))
                .andExpect(jsonPath("$.guidelineReference").isString())
                .andExpect(jsonPath("$.diagnoses[0].code").value("I10"));

        // 2. Test mining personal plan suggestions
        mockMvc.perform(get("/api/ai/clinical-assistant/plan-templates/mined-suggestions")
                        .with(rhnWorkContext()))
                .andExpect(status().isOk());
    }

    @Test
    void historical_stable_plan_endpoint_handles_encounter() throws Exception {
        String encounterId = createStartedEncounter();

        mockMvc.perform(get("/api/ai/clinical-assistant/encounters/{encounterId}/historical-stable-plan", encounterId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk());
    }

    private String createStartedEncounter() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        JsonNode resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"方案编译测试居民",
                                  "identifiers":[{"system":"9","value":"PLAN%s","useType":"SECONDARY"}],
                                  "gender":"FEMALE","birthDate":"1988-08-08"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "idempotencyCode":"PLAN-REG-%s"
                                }
                                """.formatted(resident.get("id").asString(), ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String encounterId = encounter.get("id").asString();
        mockMvc.perform(verifiedEncounterStart(encounterId)).andExpect(status().isOk());
        return encounterId;
    }
}
