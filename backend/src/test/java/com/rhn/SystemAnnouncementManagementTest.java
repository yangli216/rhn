package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SystemAnnouncementManagementTest extends RhnIntegrationTestSupport {
    @Test
    void draft_publish_read_and_withdraw_follow_auditable_lifecycle() throws Exception {
        JsonNode draft = json(mockMvc.perform(post("/api/announcement-management").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "scopeType":"DEPARTMENT",
                                  "organizationId":"%s","departmentId":"%s",
                                  "category":"MAINTENANCE","priority":"IMPORTANT",
                                  "title":"门诊系统维护通知","summary":"今晚完成门诊终端例行维护。",
                                  "content":"维护时间 22:00 至 22:30，请提前保存工作内容。",
                                  "pinned":true
                                }
                                """.formatted(ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("DRAFT"))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(get("/api/announcements").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));

        JsonNode updated = json(mockMvc.perform(put("/api/announcement-management/{id}", draft.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "expectedRevision":%d,"scopeType":"DEPARTMENT",
                                  "organizationId":"%s","departmentId":"%s",
                                  "category":"MAINTENANCE","priority":"URGENT",
                                  "title":"门诊系统维护通知","summary":"今晚完成门诊终端例行维护。",
                                  "content":"维护时间调整为 21:30 至 22:30，请提前保存工作内容。",
                                  "pinned":true
                                }
                                """.formatted(draft.get("revision").asLong(), ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.priority").value("URGENT"))
                .andReturn().getResponse().getContentAsString());

        JsonNode published = json(mockMvc.perform(post("/api/announcement-management/{id}/publish", draft.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":%d}".formatted(updated.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PUBLISHED"))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(get("/api/announcements/summary").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.unread").value(1))
                .andExpect(jsonPath("$.importantUnread").value(1));
        mockMvc.perform(get("/api/announcements").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(draft.get("id").asLong()))
                .andExpect(jsonPath("$[0].read").value(false));
        mockMvc.perform(post("/api/announcements/{id}/read", draft.get("id").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.read").value(true));
        mockMvc.perform(get("/api/announcements/summary").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.unread").value(0));

        mockMvc.perform(post("/api/announcement-management/{id}/withdraw", draft.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":%d}".formatted(published.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("WITHDRAWN"));
        mockMvc.perform(get("/api/announcements").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }
}
