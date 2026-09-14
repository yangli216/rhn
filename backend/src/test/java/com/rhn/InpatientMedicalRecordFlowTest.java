package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class InpatientMedicalRecordFlowTest extends RhnIntegrationTestSupport {
    private static final String RESIDENT = "362387869790213";
    private static final String BED = "362387869898512";

    @Test
    void canvas_editor_inpatient_document_is_versioned_and_signed_by_shared_clinical_document_foundation()
            throws Exception {
        String episode = mockMvc.perform(post("/api/inpatient/admissions").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s",
                                  "bedId":"%s",
                                  "admissionTypeCode":"GENERAL",
                                  "admissionSourceCode":"OUTPATIENT",
                                  "admissionReason":"反复咳嗽伴气促",
                                  "nursingLevelCode":"LEVEL_III",
                                  "dietCode":"NORMAL",
                                  "commandCode":"TEST-INPATIENT-EMR-ADMIT"
                                }
                                """.formatted(RESIDENT, BED)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String encounterId = json(episode).get("encounterId").asString();

        String document = mockMvc.perform(post("/api/clinical-documents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s",
                                  "encounterId":"%s",
                                  "organizationId":"%s",
                                  "departmentId":"%s",
                                  "documentType":"INPATIENT_ADMISSION_RECORD",
                                  "title":"住院模板测试居民 入院记录",
                                  "contentSchema":"RHN.CANVAS_EDITOR_DOCUMENT.V1",
                                  "content":{
                                    "editorVersion":"0.9.133",
                                    "templateId":"rhn-inpatient-admission",
                                    "templateVersion":"1.0.0",
                                    "editorData":{"main":[{"value":"主诉：反复咳嗽伴气促"}]},
                                    "plainText":"主诉：反复咳嗽伴气促",
                                    "structuredValues":{}
                                  },
                                  "changeReason":"创建入院记录"
                                }
                                """.formatted(RESIDENT, encounterId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.content.templateId").value("rhn-inpatient-admission"))
                .andExpect(jsonPath("$.history[0].integrityEvidenceId").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        String documentId = json(document).get("id").asString();

        mockMvc.perform(put("/api/clinical-documents/{documentId}/draft", documentId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "expectedCurrentVersion":1,
                                  "contentSchema":"RHN.CANVAS_EDITOR_DOCUMENT.V1",
                                  "content":{
                                    "editorVersion":"0.9.133",
                                    "templateId":"rhn-inpatient-admission",
                                    "templateVersion":"1.0.0",
                                    "editorData":{"main":[{"value":"主诉：反复咳嗽伴气促3天"}]},
                                    "plainText":"主诉：反复咳嗽伴气促3天",
                                    "structuredValues":{"chiefComplaint":"反复咳嗽伴气促3天"}
                                  },
                                  "changeReason":"完善入院记录"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currentVersion").value(2));

        mockMvc.perform(post("/api/clinical-documents/{documentId}/sign", documentId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedCurrentVersion\":2,\"signatureMeaning\":\"AUTHOR\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SIGNED"))
                .andExpect(jsonPath("$.history[0].signatureEvidenceId").isNotEmpty());

        mockMvc.perform(get("/api/clinical-documents").with(rhnWorkContext())
                        .queryParam("encounterId", encounterId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].documentType").value("INPATIENT_ADMISSION_RECORD"))
                .andExpect(jsonPath("$[0].content.plainText").value("主诉：反复咳嗽伴气促3天"))
                .andExpect(jsonPath("$[0].history.length()").value(2));
    }
}
