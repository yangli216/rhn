package com.rhn;

import com.rhn.ai.api.ClinicalAssistantContracts.DiagnosisCandidate;
import com.rhn.ai.api.ClinicalAssistantContracts.RecordDraft;
import com.rhn.ai.api.ClinicalAssistantContracts.RecommendedPlan;
import com.rhn.ai.api.ClinicalAssistantContracts.SafetyAlert;
import com.rhn.ai.api.ClinicalAssistantContracts.SuggestionContent;
import com.rhn.ai.application.ClinicalAiModelGateway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("outpatient-main-flow")
@TestPropertySource(properties = {
        "rhn.ai.mode=MODEL",
        "rhn.ai.provider=test-model-provider",
        "rhn.ai.model=test-clinical-model",
        "rhn.ai.endpoint=http://127.0.0.1:9/v1/chat/completions"
})
class ClinicalAiModelModeTest extends RhnIntegrationTestSupport {
    @MockitoBean ClinicalAiModelGateway modelGateway;

    @Test
    void modelOutputIsFilteredThroughHospitalClinicalBoundaries() throws Exception {
        when(modelGateway.analyze(any(), any())).thenReturn(new SuggestionContent("模型摘要",
                new RecordDraft(null, "待医生核对的现病史", null, null, null),
                List.of(
                        new DiagnosisCandidate("I10", "模型自写名称", "PRIMARY", 0.91, "依据当前资料"),
                        new DiagnosisCandidate("NOT-A-CODE", "模型越界诊断", "PRIMARY", 0.99, "不应保留")),
                List.of(), List.of("补问症状持续时间"),
                List.of(new SafetyAlert("UNKNOWN", "模型风险", "需要医生复核")),
                List.of(new RecommendedPlan(999999L, "模型虚构方案", "", "不应保留")), "模型声明"));

        mockMvc.perform(get("/api/ai/clinical-assistant/capabilities").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("MODEL"))
                .andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.features[1]").value("CLINICAL_RECORD_DRAFT"))
                .andExpect(jsonPath("$.features", org.hamcrest.Matchers.hasItem("CONVERSATION_FOLLOW_UP")));

        String encounterId = createStartedEncounter();
        JsonNode first = json(mockMvc.perform(post(
                        "/api/ai/clinical-assistant/encounters/{encounterId}/suggestions", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "clientContextFingerprint":"MODEL-CONTEXT",
                                  "question":"生成结构化临床建议",
                                  "draft":{
                                    "chiefComplaint":"反复头晕","presentIllness":"","medicalHistory":"高血压病史",
                                    "physicalExam":"","treatmentPlan":"","systolic":186,"diastolic":122,
                                    "temperature":36.8,"pulseRate":88,"respiratoryRate":18,"oxygenSaturation":98,
                                    "diagnoses":[]
                                  }
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.provider").value("test-model-provider"))
                .andExpect(jsonPath("$.model").value("test-clinical-model"))
                .andExpect(jsonPath("$.recordDraft.presentIllness").value("待医生核对的现病史"))
                .andExpect(jsonPath("$.diagnosisCandidates.length()").value(1))
                .andExpect(jsonPath("$.diagnosisCandidates[0].code").value("I10"))
                .andExpect(jsonPath("$.diagnosisCandidates[0].display").value("原发性高血压"))
                .andExpect(jsonPath("$.safetyAlerts[0].level").value("CRITICAL"))
                .andExpect(jsonPath("$.safetyAlerts[1].level").value("WARNING"))
                .andExpect(jsonPath("$.recommendedPlans.length()").value(0))
                .andExpect(jsonPath("$.promptVersion").value("RHN-CLINICAL-ASSISTANT-V6"))
                .andExpect(jsonPath("$.disclaimer").value(org.hamcrest.Matchers.containsString("院内术语")))
                .andReturn().getResponse().getContentAsString());

        JsonNode followUp = json(mockMvc.perform(post("/api/ai/clinical-assistant/encounters/{encounterId}/suggestions", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "clientContextFingerprint":"MODEL-CONTEXT",
                                  "parentSuggestionId":"%s",
                                  "question":"上一轮还需要补问什么？",
                                  "draft":{
                                    "chiefComplaint":"反复头晕","presentIllness":"","medicalHistory":"高血压病史",
                                    "physicalExam":"","treatmentPlan":"","systolic":186,"diastolic":122,
                                    "temperature":36.8,"pulseRate":88,"respiratoryRate":18,"oxygenSaturation":98,
                                    "diagnoses":[]
                                  }
                                }
                """.formatted(first.get("id").asText())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(org.hamcrest.Matchers.not(first.get("id").asLong())))
                .andExpect(jsonPath("$.parentSuggestionId").value(first.get("id").asLong()))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(get("/api/ai/clinical-assistant/encounters/{encounterId}/suggestions", encounterId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(followUp.get("id").asLong()))
                .andExpect(jsonPath("$[0].parentSuggestionId").value(first.get("id").asLong()))
                .andExpect(jsonPath("$[1].id").value(first.get("id").asLong()))
                .andExpect(jsonPath("$[1].parentSuggestionId").doesNotExist());

        mockMvc.perform(post("/api/ai/clinical-assistant/encounters/{encounterId}/suggestions", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "clientContextFingerprint":"MODEL-CONTEXT",
                                  "parentSuggestionId":"%s",
                                  "question":"继续上一轮分析",
                                  "draft":{"chiefComplaint":"已经变化的主诉","diagnoses":[]}
                                }
                                """.formatted(first.get("id").asText())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("AI_PARENT_SUGGESTION_DRAFT_CHANGED"));

        verify(modelGateway, times(2)).analyze(any(), any());
        verify(modelGateway).analyze(argThat(request -> request.priorSuggestion() != null
                && "模型摘要".equals(request.priorSuggestion().summary())), any());
    }

    private String createStartedEncounter() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        JsonNode resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"模型模式测试居民",
                                  "identifiers":[{"system":"9","value":"MODEL%s","useType":"SECONDARY"}],
                                  "gender":"FEMALE","birthDate":"1988-08-08"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "idempotencyCode":"MODEL-REG-%s"
                                }
                                """.formatted(resident.get("id").asText(), ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String encounterId = encounter.get("id").asText();
        mockMvc.perform(verifiedEncounterStart(encounterId)).andExpect(status().isOk());
        return encounterId;
    }
}
