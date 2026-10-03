package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class OutpatientPlanSearchProfileTest extends RhnIntegrationTestSupport {
    @Test void saved_profile_tracks_clinical_changes_but_not_usage_and_rejects_stale_linked_note_data() throws Exception {
        var note = json(mockMvc.perform(post("/api/outpatient/note-templates").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"scopeType":"PERSONAL","name":"索引来源病历","content":{"chiefComplaint":"血压升高3天"}}
                """)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String noteId = note.get("id").asString();
        String body = """
                {"scopeType":"PERSONAL","name":"索引验证方案","description":"高血压复诊用药评估","noteTemplateId":"%s",
                 "diagnoses":[{"code":"I10","display":"原发性高血压","type":"PRIMARY"}],"medications":[],"services":[],
                 "tasks":[{"kind":"CONDITION","text":"慢病复诊","origin":"EXPLICIT","status":"MATCHED"}]}
                """.formatted(noteId);
        var created = json(mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.searchProfile.summary").value("高血压复诊用药评估"))
                .andExpect(jsonPath("$.searchProfile.conditions[0]").value("慢病复诊"))
                .andReturn().getResponse().getContentAsString());
        String id = created.get("id").asString();
        String hash = created.get("searchProfile").get("contentHash").asString();
        var used = json(mockMvc.perform(post("/api/outpatient/plan-templates/{id}/use", id).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.searchProfile.contentHash").value(hash))
                .andReturn().getResponse().getContentAsString());
        var changed = json(mockMvc.perform(put("/api/outpatient/plan-templates/{id}", id).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(body.replace("高血压复诊用药评估", "高血压初诊评估")
                        .replaceFirst("\\{", "{\"expectedRevision\":" + used.get("revision").asLong() + ",")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.searchProfile.summary").value("高血压初诊评估"))
                .andReturn().getResponse().getContentAsString());
        assertNotEquals(hash, changed.get("searchProfile").get("contentHash").asString());
        mockMvc.perform(put("/api/outpatient/note-templates/{id}", noteId).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"expectedRevision":%s,"scopeType":"PERSONAL","name":"索引来源病历","content":{"chiefComplaint":"新发现血压升高"}}
                """.formatted(note.get("revision").asLong()))).andExpect(status().isOk());
        mockMvc.perform(get("/api/outpatient/plan-templates").param("keyword", "索引验证方案").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].searchProfile").doesNotExist());
        mockMvc.perform(post("/api/outpatient/plan-templates/{id}/disable", id).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":" + changed.get("revision").asLong() + "}"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/outpatient/plan-templates").param("keyword", "索引验证方案").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }
}
