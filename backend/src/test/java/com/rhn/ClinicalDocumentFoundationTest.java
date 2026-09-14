package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.util.stream.StreamSupport;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ClinicalDocumentFoundationTest extends RhnIntegrationTestSupport {

    @Test
    void outpatient_note_requires_current_signature_and_drives_department_task() throws Exception {
        String residentBody = mockMvc.perform(post("/api/residents")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"签署居民","identifiers":[{"system":"9","value":"330102198801011288","useType":"SECONDARY"}],
                                 "gender":"FEMALE","birthDate":"1988-01-01"}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String residentId = objectMapper.readTree(residentBody).get("id").asString();
        String encounterBody = mockMvc.perform(post("/api/encounters")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String encounterId = objectMapper.readTree(encounterBody).get("id").asString();
        mockMvc.perform(verifiedEncounterStart(encounterId))
                .andExpect(status().isOk());

        saveOutpatientNote(encounterId, "头晕一周");
        saveOutpatientNote(encounterId, "头晕一周，伴轻度头痛");

        String documents = mockMvc.perform(get("/api/clinical-documents")
                        .param("encounterId", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].documentType").value("OUTPATIENT_NOTE"))
                .andExpect(jsonPath("$[0].status").value("DRAFT"))
                .andExpect(jsonPath("$[0].currentVersion").value(2))
                .andReturn().getResponse().getContentAsString();
        String documentId = objectMapper.readTree(documents).get(0).get("id").asString();

        String tasks = mockMvc.perform(get("/api/tasks").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode signTask = StreamSupport.stream(objectMapper.readTree(tasks).spliterator(), false)
                .filter(node -> "CLINICAL_DOCUMENT_SIGN".equals(node.path("taskType").asString()))
                .filter(node -> encounterId.equals(node.path("encounterId").asString()))
                .findFirst().orElseThrow();
        org.junit.jupiter.api.Assertions.assertEquals(
                "/outpatient/reception?residentId=" + residentId + "&encounterId=" + encounterId,
                signTask.path("routePath").asString());
        mockMvc.perform(post("/api/tasks/{id}/complete", signTask.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TASK_BUSINESS_ACTION_REQUIRED"));

        mockMvc.perform(post("/api/encounters/{id}/complete", encounterId).with(rhnWorkContext()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DOCUMENT_SIGNATURE_REQUIRED"));
        mockMvc.perform(post("/api/clinical-documents/{id}/sign", documentId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedCurrentVersion\":2,\"signatureMeaning\":\"AUTHOR\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SIGNED"))
                .andExpect(jsonPath("$.history[0].signatureEvidenceId").isNotEmpty());

        String remainingTasks = mockMvc.perform(get("/api/tasks").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        boolean stillOpen = StreamSupport.stream(objectMapper.readTree(remainingTasks).spliterator(), false)
                .anyMatch(node -> "CLINICAL_DOCUMENT_SIGN".equals(node.path("taskType").asString())
                        && encounterId.equals(node.path("encounterId").asString()));
        org.junit.jupiter.api.Assertions.assertFalse(stillOpen);
        mockMvc.perform(post("/api/encounters/{id}/complete", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));
    }

    @Test
    void signed_document_is_immutable_and_amendment_creates_new_version() throws Exception {
        String residentBody = mockMvc.perform(post("/api/residents")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName":"赵青",
                                  "identifiers":[{"system":"9","value":"330102198801011199","useType":"SECONDARY"}],
                                  "gender":"FEMALE",
                                  "birthDate":"1988-01-01"
                                }
                                """))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String residentId = objectMapper.readTree(residentBody).get("id").asString();

        String documentBody = mockMvc.perform(post("/api/clinical-documents")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "residentId":"%s",
                                  "documentType":"CARE_SUMMARY",
                                  "title":"诊疗摘要",
                                  "contentSchema":"RHN.CARE_SUMMARY.V1",
                                  "content":{"summary":"初稿"},
                                  "changeReason":"创建摘要"
                                }
                                """.formatted(residentId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.currentVersion").value(1))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.instanceKey").value("DEFAULT"))
                .andExpect(jsonPath("$.history[0].contentDigestAlgorithm").value("SHA-256"))
                .andExpect(jsonPath("$.history[0].contentDigest").isNotEmpty())
                .andExpect(jsonPath("$.history[0].integrityEvidenceId").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        String documentId = objectMapper.readTree(documentBody).get("id").asString();

        update(documentId, 1, "补充后的草稿")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currentVersion").value(2));

        update(documentId, 1, "基于过期版本修改")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DOCUMENT_VERSION_CONFLICT"));

        sign(documentId, 2)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SIGNED"))
                .andExpect(jsonPath("$.history[0].signedBy").value("doctor"))
                .andExpect(jsonPath("$.history[0].signatureEvidenceId").isNotEmpty());

        update(documentId, 2, "不允许直接覆盖签署版本")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DOCUMENT_NOT_EDITABLE"));

        mockMvc.perform(post("/api/clinical-documents/{id}/amendments", documentId)
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "expectedCurrentVersion":2,
                                  "contentSchema":"RHN.CARE_SUMMARY.V1",
                                  "content":{"summary":"签署后的合法修订"},
                                  "changeReason":"更正文字表述"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("AMENDMENT_IN_PROGRESS"))
                .andExpect(jsonPath("$.currentVersion").value(3));

        sign(documentId, 3).andExpect(status().isOk());

        mockMvc.perform(get("/api/clinical-documents/{id}", documentId)
                        .with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SIGNED"))
                .andExpect(jsonPath("$.content.summary").value("签署后的合法修订"))
                .andExpect(jsonPath("$.history.length()").value(3));
    }

    @Test
    void same_document_type_supports_multiple_explicit_instances_in_one_encounter() throws Exception {
        String residentBody = mockMvc.perform(post("/api/residents")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"多病程居民","identifiers":[{"system":"9","value":"330102198801011377","useType":"SECONDARY"}],
                                 "gender":"MALE","birthDate":"1988-01-01"}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String residentId = objectMapper.readTree(residentBody).get("id").asString();
        String encounterBody = mockMvc.perform(post("/api/encounters")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String encounterId = objectMapper.readTree(encounterBody).get("id").asString();

        createProgressNote(residentId, encounterId, "PROGRESS-20260830-AM", "上午病情平稳")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.documentType").value("INPATIENT_DAILY_PROGRESS_NOTE"))
                .andExpect(jsonPath("$.instanceKey").value("PROGRESS-20260830-AM"));
        createProgressNote(residentId, encounterId, "PROGRESS-20260830-PM", "下午调整用药")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.instanceKey").value("PROGRESS-20260830-PM"));

        mockMvc.perform(get("/api/clinical-documents").param("encounterId", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)));
    }

    private org.springframework.test.web.servlet.ResultActions update(
            String documentId, int expectedVersion, String summary) throws Exception {
        return mockMvc.perform(put("/api/clinical-documents/{id}/draft", documentId)
                .with(rhn())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "expectedCurrentVersion":%d,
                          "contentSchema":"RHN.CARE_SUMMARY.V1",
                          "content":{"summary":"%s"},
                          "changeReason":"更新草稿"
                        }
                        """.formatted(expectedVersion, summary)));
    }

    private void saveOutpatientNote(String encounterId, String chiefComplaint) throws Exception {
        mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"chiefComplaint":"%s","systolic":148,"diastolic":92,
                                 "diagnoses":[{"code":"I10","display":"原发性高血压","type":"PRIMARY"}]}
                                """.formatted(chiefComplaint)))
                .andExpect(status().isOk());
    }

    private org.springframework.test.web.servlet.ResultActions sign(String documentId, int version) throws Exception {
        return mockMvc.perform(post("/api/clinical-documents/{id}/sign", documentId)
                .with(rhn())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"expectedCurrentVersion":%d,"signatureMeaning":"AUTHOR"}
                        """.formatted(version)));
    }

    private org.springframework.test.web.servlet.ResultActions createProgressNote(
            String residentId, String encounterId, String instanceKey, String summary) throws Exception {
        return mockMvc.perform(post("/api/clinical-documents")
                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"residentId":"%s","encounterId":"%s","organizationId":"%s","departmentId":"%s",
                         "documentType":"INPATIENT_DAILY_PROGRESS_NOTE","instanceKey":"%s",
                         "title":"日常病程记录","contentSchema":"RHN.CANVAS_EDITOR_DOCUMENT.V1",
                         "content":{"summary":"%s"},"changeReason":"创建日常病程"}
                        """.formatted(residentId, encounterId, ORGANIZATION, DEPARTMENT, instanceKey, summary)));
    }
}
