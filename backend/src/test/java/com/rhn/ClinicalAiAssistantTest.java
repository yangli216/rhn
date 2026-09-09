package com.rhn;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.UUID;

import static org.hamcrest.Matchers.startsWith;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("outpatient-main-flow")
class ClinicalAiAssistantTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void speechTranscriptionIsUnavailableUnlessModelSpeechEndpointIsConfigured() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        String encounterId = createStartedEncounter(suffix);
        MockMultipartFile audio = new MockMultipartFile(
                "file", "note.webm", "audio/webm", new byte[]{1});

        mockMvc.perform(multipart("/api/ai/clinical-assistant/encounters/{encounterId}/transcriptions", encounterId)
                        .file(audio).with(rhnWorkContext()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("AI_SPEECH_UNAVAILABLE"));

        mockMvc.perform(post("/api/ai/clinical-assistant/encounters/{encounterId}/knowledge-searches", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"query\":\"高血压\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("AI_KNOWLEDGE_UNAVAILABLE"));
    }

    @Test
    void local_assistant_is_structured_audited_and_never_mutates_clinical_diagnoses() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();

        mockMvc.perform(get("/api/ai/clinical-assistant/capabilities").with(rhn()))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/ai/clinical-assistant/capabilities").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("LOCAL_ASSIST"))
                .andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.provider").value("local-assist"))
                .andExpect(jsonPath("$.model").value("local-rules-v1"))
                .andExpect(jsonPath("$.features[0]").value("RECORD_COMPLETENESS"))
                .andExpect(jsonPath("$.features[4]").value("AUDIT_TRAIL"));

        String planName = "AI高血压核对方案-" + suffix;
        JsonNode plan = json(mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "scopeType":"PERSONAL","name":"%s","description":"AI只读匹配测试方案",
                                  "diagnoses":[{"code":"I10","display":"原发性高血压","type":"PRIMARY"}],
                                  "medications":[],"services":[]
                                }
                                """.formatted(planName)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());

        String encounterId = createStartedEncounter(suffix);
        int diagnosisBaseline = diagnosisCount(encounterId);
        ClinicalCounts clinicalBaseline = clinicalCounts(encounterId);
        assertEquals(0, diagnosisBaseline);

        JsonNode suggestion = generateSuggestion(encounterId, "AI-CONTEXT-" + suffix, planName);
        String suggestionId = suggestion.get("id").asText();
        String contextHash = suggestion.get("contextHash").asText();

        assertEquals(1, jdbcTemplate.queryForObject(
                "select count(*) from RHN_AI_SUGGEST where ID_TNT=? and ID_AI_SUGGEST=? and ID_ENC=? and SD_STATUS='GENERATED'",
                Integer.class, Long.valueOf(TENANT), Long.valueOf(suggestionId), Long.valueOf(encounterId)));
        assertEquals(1, eventCount(suggestionId));
        assertEquals(1, eventCount(suggestionId, "GENERATED"));
        assertEquals(diagnosisBaseline, diagnosisCount(encounterId), "生成建议不得写入诊断");
        assertEquals(clinicalBaseline, clinicalCounts(encounterId), "生成建议不得写入主要临床表");
        String evidence = jdbcTemplate.queryForObject(
                "select JSON_EVID as evidence_json from RHN_AI_SUGGEST where ID_TNT=? and ID_AI_SUGGEST=?",
                String.class, Long.valueOf(TENANT), Long.valueOf(suggestionId));
        assertTrue(evidence.contains("presentInputFields"));
        assertTrue(evidence.contains("serverContextHash"));
        assertFalse(evidence.contains(planName), "审计证据不得重复保存问题明文");
        assertFalse(evidence.contains("反复头晕"), "审计证据不得重复保存病历草稿明文");

        mockMvc.perform(get("/api/ai/clinical-assistant/encounters/{encounterId}/suggestions", encounterId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(Long.valueOf(suggestionId)))
                .andExpect(jsonPath("$[0].status").value("GENERATED"))
                .andExpect(jsonPath("$[0].contextHash").value(contextHash))
                .andExpect(jsonPath("$[0].recommendedPlans[0].templateId").value(plan.get("id").asLong()));

        mockMvc.perform(post("/api/ai/clinical-assistant/suggestions/{suggestionId}/events", suggestionId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "commandCode":"AI-VIEW-%s","eventType":"VIEWED","sectionCode":"ALL",
                                  "contextHash":"%s","detail":"医生查看建议"
                                }
                                """.formatted(suffix, contextHash)))
                .andExpect(status().isNoContent());
        assertEquals(2, eventCount(suggestionId));
        assertEquals(1, eventCount(suggestionId, "VIEWED"));
        assertEquals(diagnosisBaseline, diagnosisCount(encounterId), "查看建议不得写入诊断");

        Long residentId = jdbcTemplate.queryForObject(
                "select ID_PAT as resident_id from RHN_VIS_ENC where ID_TNT=? and ID_ENC=?",
                Long.class, Long.valueOf(TENANT), Long.valueOf(encounterId));
        mockMvc.perform(post("/api/clinical-documents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","encounterId":"%s",
                                  "organizationId":"%s","departmentId":"%s",
                                  "documentType":"OUTPATIENT_NOTE","title":"门诊病历",
                                  "contentSchema":"RHN.OUTPATIENT_NOTE.V3",
                                  "content":{"chiefComplaint":"医生补充后的病历"},
                                  "changeReason":"验证 AI 服务端采纳锚点"
                                }
                                """.formatted(residentId, encounterId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated());
        ClinicalCounts anchoredBaseline = clinicalCounts(encounterId);
        int anchoredEventBaseline = eventCount(suggestionId);
        mockMvc.perform(post("/api/ai/clinical-assistant/suggestions/{suggestionId}/events", suggestionId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "commandCode":"AI-ADOPT-ANCHOR-CHANGED-%s","eventType":"ADOPTED","sectionCode":"ALL",
                                  "contextHash":"%s","detail":"病历版本变化后尝试采纳"
                                }
                                """.formatted(suffix, contextHash)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("AI_SUGGESTION_SERVER_CONTEXT_CHANGED"));
        assertEquals(anchoredEventBaseline, eventCount(suggestionId), "服务端锚点变化不得落采纳事件");
        assertEquals("GENERATED", suggestionStatus(suggestionId));
        assertEquals(anchoredBaseline, clinicalCounts(encounterId), "锚点冲突不得改写主要临床表");

        Instant expiredAt = Instant.parse(suggestion.get("generatedAt").asText()).plusMillis(10);
        while (!Instant.now().isAfter(expiredAt)) {
            Thread.onSpinWait();
        }
        assertEquals(1, jdbcTemplate.update(
                "update RHN_AI_SUGGEST set DT_EXPIRES=? where ID_TNT=? and ID_AI_SUGGEST=?",
                expiredAt, Long.valueOf(TENANT), Long.valueOf(suggestionId)));

        mockMvc.perform(post("/api/ai/clinical-assistant/suggestions/{suggestionId}/events", suggestionId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "commandCode":"AI-ADOPT-EXPIRED-%s","eventType":"ADOPTED","sectionCode":"ALL",
                                  "contextHash":"%s","detail":"尝试采纳过期建议"
                                }
                                """.formatted(suffix, contextHash)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("AI_SUGGESTION_EXPIRED"));
        assertEquals("EXPIRED", jdbcTemplate.queryForObject(
                "select SD_STATUS as status from RHN_AI_SUGGEST where ID_TNT=? and ID_AI_SUGGEST=?",
                String.class, Long.valueOf(TENANT), Long.valueOf(suggestionId)));
        assertEquals(1, eventCount(suggestionId, "EXPIRED"));
        assertEquals(0, eventCount(suggestionId, "ADOPTED"));
        assertEquals("GENERATED->EXPIRED", jdbcTemplate.queryForObject(
                "select SD_STATUS_FROM || '->' || SD_STATUS_TO from RHN_AI_SUGGEST_EVT "
                        + "where ID_TNT=? and ID_AI_SUGGEST=? and SD_EVT_TYPE='EXPIRED'",
                String.class, Long.valueOf(TENANT), Long.valueOf(suggestionId)));
        assertEquals(diagnosisBaseline, diagnosisCount(encounterId), "过期建议不得被采纳为诊断");

        JsonNode freshSuggestion = generateSuggestion(encounterId, "AI-CONTEXT-FRESH-" + suffix, planName);
        String freshSuggestionId = freshSuggestion.get("id").asText();
        int freshEventBaseline = eventCount(freshSuggestionId);

        mockMvc.perform(post("/api/ai/clinical-assistant/suggestions/{suggestionId}/events", freshSuggestionId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "commandCode":"AI-STALE-%s","eventType":"ADOPTED","sectionCode":"ALL",
                                  "contextHash":"sha256:0000000000000000000000000000000000000000000000000000000000000000",
                                  "detail":"使用已变化的病历上下文"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("AI_SUGGESTION_CONTEXT_CHANGED"));
        assertEquals(freshEventBaseline, eventCount(freshSuggestionId), "错误上下文不得新增审计事件");
        assertEquals("GENERATED", jdbcTemplate.queryForObject(
                "select SD_STATUS as status from RHN_AI_SUGGEST where ID_TNT=? and ID_AI_SUGGEST=?",
                String.class, Long.valueOf(TENANT), Long.valueOf(freshSuggestionId)));
        assertEquals(diagnosisBaseline, diagnosisCount(encounterId), "错误事件不得写入诊断");

        mockMvc.perform(post("/api/ai/clinical-assistant/suggestions/{suggestionId}/events", freshSuggestionId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "commandCode":"AI-ADOPT-VALID-%s","eventType":"ADOPTED","sectionCode":"ALL",
                                  "contextHash":"%s","detail":"医生确认采纳当前建议"
                                }
                                """.formatted(suffix, freshSuggestion.get("contextHash").asText())))
                .andExpect(status().isNoContent());
        assertEquals(1, eventCount(freshSuggestionId, "ADOPTED"));

        mockMvc.perform(post("/api/ai/clinical-assistant/suggestions/{suggestionId}/events", freshSuggestionId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "commandCode":"AI-ADOPT-DUPLICATE-%s","eventType":"ADOPTED","sectionCode":"ALL",
                                  "contextHash":"%s","detail":"重复采纳终态建议"
                                }
                                """.formatted(suffix, freshSuggestion.get("contextHash").asText())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("AI_SUGGESTION_STATE_INVALID"));
        assertEquals(1, eventCount(freshSuggestionId, "ADOPTED"), "终态建议不得重复记录采纳事件");
        assertEquals(diagnosisBaseline, diagnosisCount(encounterId), "采纳 AI 建议事件不得直接写入诊断");

        assertEquals(1, jdbcTemplate.update(
                "update RHN_AI_SUGGEST set DT_EXPIRES=? where ID_TNT=? and ID_AI_SUGGEST=?",
                Instant.parse(freshSuggestion.get("generatedAt").asText()).plusMillis(10),
                Long.valueOf(TENANT), Long.valueOf(freshSuggestionId)));
        mockMvc.perform(post("/api/ai/clinical-assistant/suggestions/{suggestionId}/events", freshSuggestionId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "commandCode":"AI-VIEW-TERMINAL-%s","eventType":"VIEWED","sectionCode":"ALL",
                                  "contextHash":"%s","detail":"查看已采纳的历史建议"
                                }
                                """.formatted(suffix, freshSuggestion.get("contextHash").asText())))
                .andExpect(status().isNoContent());
        assertEquals("ADOPTED", suggestionStatus(freshSuggestionId));
        assertEquals(0, eventCount(freshSuggestionId, "EXPIRED"), "终态建议查看不得伪造过期事件");
        assertEquals(1, eventCount(freshSuggestionId, "VIEWED"));

        JsonNode partial = generateSuggestion(encounterId, "AI-CONTEXT-PARTIAL-" + suffix, planName);
        mockMvc.perform(post("/api/ai/clinical-assistant/suggestions/{suggestionId}/events", partial.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "commandCode":"AI-ADOPT-PARTIAL-%s","eventType":"ADOPTED","sectionCode":"RECORD_DRAFT",
                                  "contextHash":"%s","detail":"仅采纳病历草稿"
                                }
                                """.formatted(suffix, partial.get("contextHash").asText())))
                .andExpect(status().isNoContent());
        mockMvc.perform(post("/api/ai/clinical-assistant/suggestions/{suggestionId}/events", partial.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "commandCode":"AI-IGNORE-PARTIAL-%s","eventType":"IGNORED","sectionCode":"ALL",
                                  "contextHash":"%s","detail":"尝试忽略已部分采纳建议"
                                }
                                """.formatted(suffix, partial.get("contextHash").asText())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("AI_SUGGESTION_STATE_INVALID"));
        assertEquals("PARTIALLY_ADOPTED", suggestionStatus(partial.get("id").asText()));

        JsonNode beforeSuspend = generateSuggestion(encounterId, "AI-CONTEXT-SUSPEND-" + suffix, planName);
        mockMvc.perform(post("/api/encounters/{id}/suspend", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"commandCode":"AI-SUSPEND-%s","reason":"验证暂挂后禁止采纳 AI 建议"}
                                """.formatted(suffix)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUSPENDED"));
        mockMvc.perform(post("/api/ai/clinical-assistant/suggestions/{suggestionId}/events",
                        beforeSuspend.get("id").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "commandCode":"AI-ADOPT-SUSPENDED-%s","eventType":"ADOPTED","sectionCode":"ALL",
                                  "contextHash":"%s","detail":"暂挂后尝试采纳"
                                }
                                """.formatted(suffix, beforeSuspend.get("contextHash").asText())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("AI_ENCOUNTER_NOT_ACTIVE"));
        assertEquals(0, eventCount(beforeSuspend.get("id").asText(), "ADOPTED"));
        assertEquals(anchoredBaseline, clinicalCounts(encounterId), "所有 AI 操作均不得改写主要临床表");
    }

    private JsonNode generateSuggestion(String encounterId, String fingerprint, String planName) throws Exception {
        return json(mockMvc.perform(post("/api/ai/clinical-assistant/encounters/{encounterId}/suggestions", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "clientContextFingerprint":"%s","question":"请核对%s",
                                  "draft":{
                                    "chiefComplaint":"反复头晕，血压升高","presentIllness":"",
                                    "medicalHistory":"既往高血压","physicalExam":"","treatmentPlan":"",
                                    "systolic":186,"diastolic":122,"temperature":36.8,
                                    "pulseRate":88,"respiratoryRate":18,"oxygenSaturation":98,
                                    "diagnoses":[{"code":"I10","display":"原发性高血压","type":"PRIMARY"}]
                                  }
                                }
                                """.formatted(fingerprint, planName)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("GENERATED"))
                .andExpect(jsonPath("$.contextHash", startsWith("sha256:")))
                .andExpect(jsonPath("$.clientContextFingerprint").value(fingerprint))
                .andExpect(jsonPath("$.provider").value("local-assist"))
                .andExpect(jsonPath("$.model").value("local-rules-v1"))
                .andExpect(jsonPath("$.summary").isNotEmpty())
                .andExpect(jsonPath("$.recordDraft.presentIllness").isNotEmpty())
                .andExpect(jsonPath("$.recordDraft.physicalExam").isNotEmpty())
                .andExpect(jsonPath("$.diagnosisCandidates[0].code").value("I10"))
                .andExpect(jsonPath("$.diagnosisCandidates[0].confidence").value(1.0))
                .andExpect(jsonPath("$.differentialDiagnoses").isArray())
                .andExpect(jsonPath("$.missingInformation").isArray())
                .andExpect(jsonPath("$.safetyAlerts[0].level").value("CRITICAL"))
                .andExpect(jsonPath("$.recommendedPlans[0].name").value(planName))
                .andExpect(jsonPath("$.disclaimer").isNotEmpty())
                .andReturn().getResponse().getContentAsString());
    }

    private String createStartedEncounter(String suffix) throws Exception {
        String residentId = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"AI助手测试居民","identifiers":[{"system":"9","value":"AI%s","useType":"SECONDARY"}],
                                  "gender":"FEMALE","birthDate":"1988-08-08"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).get("id").asText();
        String encounterId = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "idempotencyCode":"AI-REG-%s"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).get("id").asText();
        mockMvc.perform(verifiedEncounterStart(encounterId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_PROGRESS"));
        return encounterId;
    }

    private int diagnosisCount(String encounterId) {
        return jdbcTemplate.queryForObject(
                "select count(*) from RHN_VIS_ENC_DIAG where ID_TNT=? and ID_ENC=?",
                Integer.class, Long.valueOf(TENANT), Long.valueOf(encounterId));
    }

    private int eventCount(String suggestionId) {
        return jdbcTemplate.queryForObject(
                "select count(*) from RHN_AI_SUGGEST_EVT where ID_TNT=? and ID_AI_SUGGEST=?",
                Integer.class, Long.valueOf(TENANT), Long.valueOf(suggestionId));
    }

    private int eventCount(String suggestionId, String eventType) {
        return jdbcTemplate.queryForObject(
                "select count(*) from RHN_AI_SUGGEST_EVT where ID_TNT=? and ID_AI_SUGGEST=? and SD_EVT_TYPE=?",
                Integer.class, Long.valueOf(TENANT), Long.valueOf(suggestionId), eventType);
    }

    private String suggestionStatus(String suggestionId) {
        return jdbcTemplate.queryForObject(
                "select SD_STATUS as status from RHN_AI_SUGGEST where ID_TNT=? and ID_AI_SUGGEST=?",
                String.class, Long.valueOf(TENANT), Long.valueOf(suggestionId));
    }

    private ClinicalCounts clinicalCounts(String encounterId) {
        Long tenantId = Long.valueOf(TENANT);
        Long id = Long.valueOf(encounterId);
        return new ClinicalCounts(
                jdbcTemplate.queryForObject("select count(*) from RHN_VIS_ENC_DIAG where ID_TNT=? and ID_ENC=?",
                        Integer.class, tenantId, id),
                jdbcTemplate.queryForObject("select count(*) from RHN_VIS_CLIN_DOC where ID_TNT=? and ID_ENC=?",
                        Integer.class, tenantId, id),
                jdbcTemplate.queryForObject("select count(*) from RHN_VIS_CLIN_DOC_VER v join RHN_VIS_CLIN_DOC d "
                                + "on d.ID_TNT=v.ID_TNT and d.ID_CLIN_DOC=v.ID_CLIN_DOC where d.ID_TNT=? and d.ID_ENC=?",
                        Integer.class, tenantId, id),
                jdbcTemplate.queryForObject("select count(*) from RHN_EX_REQ_GRP where ID_TNT=? and ID_ENC=?",
                        Integer.class, tenantId, id),
                jdbcTemplate.queryForObject("select count(*) from RHN_EX_MED_REQ m join RHN_EX_CARE_REQ c "
                                + "on c.ID_TNT=m.ID_TNT and c.ID_CARE_REQ=m.ID_CARE_REQ where c.ID_TNT=? and c.ID_ENC=?",
                        Integer.class, tenantId, id),
                jdbcTemplate.queryForObject("select count(*) from RHN_EX_SVC_REQ s join RHN_EX_CARE_REQ c "
                                + "on c.ID_TNT=s.ID_TNT and c.ID_CARE_REQ=s.ID_CARE_REQ where c.ID_TNT=? and c.ID_ENC=?",
                        Integer.class, tenantId, id));
    }

    private record ClinicalCounts(int diagnoses, int documents, int documentVersions,
                                  int requestGroups, int medicationRequests, int serviceRequests) {}
}
