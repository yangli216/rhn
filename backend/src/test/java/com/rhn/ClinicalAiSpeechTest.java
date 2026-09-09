package com.rhn;

import com.rhn.ai.application.ClinicalAiModelGateway;
import com.rhn.ai.application.ClinicalAiSpeechGateway;
import com.rhn.ai.application.ClinicalKnowledgeGateway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("outpatient-main-flow")
@TestPropertySource(properties = {
        "rhn.ai.mode=MODEL",
        "rhn.ai.provider=test-speech-provider",
        "rhn.ai.model=test-clinical-model",
        "rhn.ai.endpoint=http://127.0.0.1:9/v1/chat/completions",
        "rhn.ai.speech-endpoint=http://127.0.0.1:9/v1/audio/transcriptions",
        "rhn.ai.speech-model=test-transcribe",
        "rhn.ai.max-audio-bytes=1024",
        "rhn.ai.knowledge-endpoint=http://127.0.0.1:9/v1/knowledge/pmphai/search",
        "rhn.ai.max-knowledge-results=2"
})
class ClinicalAiSpeechTest extends RhnIntegrationTestSupport {
    @MockitoBean ClinicalAiModelGateway modelGateway;
    @MockitoBean ClinicalAiSpeechGateway speechGateway;
    @MockitoBean ClinicalKnowledgeGateway knowledgeGateway;
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void validatesAudioBeforeCallingSpeechProviderAndReturnsEditableTranscript() throws Exception {
        String encounterId = createStartedEncounter();

        mockMvc.perform(multipart("/api/ai/clinical-assistant/encounters/{encounterId}/transcriptions", encounterId)
                        .file(file("note.txt", "text/plain", new byte[]{1})).with(rhnWorkContext()))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("AI_SPEECH_FORMAT_UNSUPPORTED"));
        mockMvc.perform(multipart("/api/ai/clinical-assistant/encounters/{encounterId}/transcriptions", encounterId)
                        .file(file("empty.webm", "audio/webm", new byte[0])).with(rhnWorkContext()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("AI_SPEECH_EMPTY"));
        mockMvc.perform(multipart("/api/ai/clinical-assistant/encounters/{encounterId}/transcriptions", encounterId)
                        .file(file("large.webm", "audio/webm", new byte[1025])).with(rhnWorkContext()))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.code").value("AI_SPEECH_TOO_LARGE"))
                .andExpect(jsonPath("$.message").value("录音超过 1 KB，请缩短后重试。"));
        verify(speechGateway, never()).transcribe(any(), any());

        when(speechGateway.transcribe(any(), any())).thenReturn("患者诉咳嗽三天，无胸痛。");
        byte[] audio = "webm-audio".getBytes(StandardCharsets.UTF_8);
        mockMvc.perform(multipart("/api/ai/clinical-assistant/encounters/{encounterId}/transcriptions", encounterId)
                        .file(file("doctor-note.webm", "audio/webm;codecs=opus", audio)).with(rhnWorkContext()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.text").value("患者诉咳嗽三天，无胸痛。"))
                .andExpect(jsonPath("$.provider").value("test-speech-provider"))
                .andExpect(jsonPath("$.model").value("test-transcribe"))
                .andExpect(jsonPath("$.contentType").value("audio/webm"))
                .andExpect(jsonPath("$.audioBytes").value(audio.length))
                .andExpect(jsonPath("$.transcribedAt").exists());
        verify(speechGateway).transcribe(argThat(request -> request.contentType().equals("audio/webm")
                && request.fileName().equals("clinical-dictation.webm")
                && request.languageHint().equals("zh")
                && java.util.Arrays.equals(request.audio(), audio)), any());
    }

    @Test
    void requiresDoctorWorkContextCurrentDoctorAndActiveEncounter() throws Exception {
        String encounterId = createStartedEncounter();
        MockMultipartFile audio = file("note.webm", "audio/webm", new byte[]{1});

        mockMvc.perform(multipart("/api/ai/clinical-assistant/encounters/{encounterId}/transcriptions", encounterId)
                .file(audio).with(rhn()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("WORK_CONTEXT_REQUIRED"));

        jdbcTemplate.update("update RHN_VIS_ENC set ID_CLINICIAN=? where ID_TNT=? and ID_ENC=?",
                "another-doctor", Long.valueOf(TENANT), Long.valueOf(encounterId));
        mockMvc.perform(multipart("/api/ai/clinical-assistant/encounters/{encounterId}/transcriptions", encounterId)
                        .file(audio).with(rhnWorkContext()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("AI_ENCOUNTER_DOCTOR_FORBIDDEN"));

        String suspendedEncounterId = createStartedEncounter();
        mockMvc.perform(post("/api/encounters/{id}/suspend", suspendedEncounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"AI-SPEECH-SUSPEND-" + UUID.randomUUID() +
                                "\",\"reason\":\"验证非活动就诊门禁\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(multipart("/api/ai/clinical-assistant/encounters/{encounterId}/transcriptions",
                        suspendedEncounterId).file(audio).with(rhnWorkContext()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("AI_ENCOUNTER_NOT_ACTIVE"));
        verify(speechGateway, never()).transcribe(any(), any());
    }

    @Test
    void masksSpeechProviderFailure() throws Exception {
        String encounterId = createStartedEncounter();
        when(speechGateway.transcribe(any(), any())).thenThrow(new IllegalStateException("upstream-secret"));

        mockMvc.perform(multipart("/api/ai/clinical-assistant/encounters/{encounterId}/transcriptions", encounterId)
                        .file(file("note.wav", "audio/wav", new byte[]{1})).with(rhnWorkContext()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("AI_SPEECH_PROVIDER_UNAVAILABLE"))
                .andExpect(jsonPath("$.message").value("语音转写暂时不可用，请改用文字输入或稍后重试。"));
    }

    @Test
    void retrievesOnlyTraceableKnowledgeForCurrentEncounter() throws Exception {
        String encounterId = createStartedEncounter();
        when(knowledgeGateway.search(eq("原发性高血压"), eq(2), any())).thenReturn(java.util.List.of(
                new ClinicalKnowledgeGateway.KnowledgeResult("source-1", "中国高血压防治指南",
                        "成年人血压评估片段", 1.2, "人卫临床知识库", "kb-1", "2024", "第 3 章"),
                new ClinicalKnowledgeGateway.KnowledgeResult("source-2", "缺少来源", "不应展示",
                        0.8, "", null, null, null)));

        mockMvc.perform(post("/api/ai/clinical-assistant/encounters/{encounterId}/knowledge-searches", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"query\":\"原发性高血压\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.query").value("原发性高血压"))
                .andExpect(jsonPath("$.provider").value("test-speech-provider"))
                .andExpect(jsonPath("$.results.length()").value(1))
                .andExpect(jsonPath("$.results[0].id").value("source-1"))
                .andExpect(jsonPath("$.results[0].title").value("中国高血压防治指南"))
                .andExpect(jsonPath("$.results[0].sourceName").value("人卫临床知识库"))
                .andExpect(jsonPath("$.results[0].publishYear").value("2024"))
                .andExpect(jsonPath("$.results[0].resourcePosition").value("第 3 章"))
                .andExpect(jsonPath("$.results[0].score").value(1.0));
    }

    private MockMultipartFile file(String name, String contentType, byte[] bytes) {
        return new MockMultipartFile("file", name, contentType, bytes);
    }

    private String createStartedEncounter() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        JsonNode resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"语音测试居民",
                                  "identifiers":[{"system":"9","value":"SPEECH%s","useType":"SECONDARY"}],
                                  "gender":"FEMALE","birthDate":"1988-08-08"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "idempotencyCode":"SPEECH-REG-%s"
                                }
                                """.formatted(resident.get("id").asText(), ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String encounterId = encounter.get("id").asText();
        mockMvc.perform(verifiedEncounterStart(encounterId)).andExpect(status().isOk());
        return encounterId;
    }
}
