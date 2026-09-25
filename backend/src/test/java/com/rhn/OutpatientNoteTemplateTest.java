package com.rhn;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("outpatient-main-flow")
class OutpatientNoteTemplateTest extends RhnIntegrationTestSupport {
    @Test
    void note_template_reuses_only_schema_controlled_narrative_sections() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        String name = "高血压复诊病历-" + suffix;
        JsonNode created = json(mockMvc.perform(post("/api/outpatient/note-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "scopeType":"PERSONAL","name":"%s","description":"全科慢病复诊书写框架",
                                  "specialtyCode":"GENERAL_PRACTICE",
                                  "content":{
                                    "chiefComplaint":"血压升高复诊",
                                    "presentIllness":"近期家庭血压监测情况：",
                                    "medicalHistory":"既往高血压病史：",
                                    "physicalExam":"心肺查体：",
                                    "treatmentPlan":"继续监测血压并评估用药调整。"
                                  }
                                }
                                """.formatted(name)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.scopeType").value("PERSONAL"))
                .andExpect(jsonPath("$.specialtyCode").value("GENERAL_PRACTICE"))
                .andExpect(jsonPath("$.documentType").value("OUTPATIENT_NOTE"))
                .andExpect(jsonPath("$.contentSchema").value("RHN.OUTPATIENT_NOTE_TEMPLATE.V1"))
                .andExpect(jsonPath("$.content.chiefComplaint").value("血压升高复诊"))
                .andExpect(jsonPath("$.content.vitalSigns").doesNotExist())
                .andExpect(jsonPath("$.content.diagnoses").doesNotExist())
                .andReturn().getResponse().getContentAsString());

        String templateId = created.get("id").asString();
        mockMvc.perform(get("/api/outpatient/note-templates").with(rhnWorkContext())
                        .param("keyword", suffix).param("specialtyCode", "GENERAL_PRACTICE"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(Long.valueOf(templateId)));
        mockMvc.perform(post("/api/outpatient/note-templates/{id}/use", templateId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.useCount").value(1));
        mockMvc.perform(post("/api/outpatient/note-templates/{id}/disable", templateId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":1}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("INACTIVE"));
        mockMvc.perform(get("/api/outpatient/note-templates").with(rhnWorkContext()).param("keyword", suffix))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void note_template_rejects_empty_content_and_uncontrolled_specialty_code() throws Exception {
        mockMvc.perform(post("/api/outpatient/note-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"scopeType":"PERSONAL","name":"空模板","content":{}}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("NOTE_TEMPLATE_EMPTY"));

        mockMvc.perform(post("/api/outpatient/note-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"scopeType":"DEPARTMENT","name":"非法专科模板","specialtyCode":"全科",
                                 "content":{"physicalExam":"查体："}}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("NOTE_TEMPLATE_SPECIALTY_INVALID"));
    }

    @Test
    void note_template_supports_manual_update_with_revision_control() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        JsonNode created = json(mockMvc.perform(post("/api/outpatient/note-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"scopeType":"PERSONAL","name":"人工维护-%s",
                                 "content":{"chiefComplaint":"原主诉"}}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());

        mockMvc.perform(put("/api/outpatient/note-templates/{id}", created.get("id").asLong()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":0,"scopeType":"DEPARTMENT","name":"人工维护-%s-新版",
                                 "description":"人工编辑后的病历模板","specialtyCode":"GENERAL_PRACTICE",
                                 "content":{"chiefComplaint":"更新后的主诉","physicalExam":"心肺查体："}}
                                """.formatted(suffix)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.scopeType").value("DEPARTMENT"))
                .andExpect(jsonPath("$.content.chiefComplaint").value("更新后的主诉"));

        mockMvc.perform(put("/api/outpatient/note-templates/{id}", created.get("id").asLong()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":0,"scopeType":"PERSONAL","name":"过期更新",
                                 "content":{"chiefComplaint":"不会保存"}}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOTE_TEMPLATE_REVISION_CONFLICT"));
    }
}
