package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.beans.factory.annotation.Autowired;
import com.rhn.platform.realtime.application.PresenceMetricCollector;

import java.time.Instant;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PresenceManagementTest extends RhnIntegrationTestSupport {
    @Autowired PresenceMetricCollector metrics;

    @Test
    void multiple_realtime_connections_are_deduplicated_by_user_and_work_context() throws Exception {
        MvcResult first = connect();

        mockMvc.perform(get("/api/presence/summary").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.onlineUsers").value(1))
                .andExpect(jsonPath("$.activeUsers").value(1))
                .andExpect(jsonPath("$.onlineContexts").value(1))
                .andExpect(jsonPath("$.connections").value(1))
                .andExpect(jsonPath("$.instances").value(1))
                .andExpect(jsonPath("$.departments[0].departmentId").value(Long.parseLong(DEPARTMENT)));

        MvcResult second = connect();

        mockMvc.perform(get("/api/presence/summary").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.onlineUsers").value(1))
                .andExpect(jsonPath("$.onlineContexts").value(1))
                .andExpect(jsonPath("$.connections").value(2));
        mockMvc.perform(get("/api/presence/users").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].username").value("doctor"))
                .andExpect(jsonPath("$.items[0].organizationId").value(Long.parseLong(ORGANIZATION)))
                .andExpect(jsonPath("$.items[0].departmentId").value(Long.parseLong(DEPARTMENT)))
                .andExpect(jsonPath("$.items[0].connectionCount").value(2));
        mockMvc.perform(post("/api/presence/activity").with(rhnWorkContext()))
                .andExpect(status().isNoContent());
        metrics.collect();
        Instant now = Instant.now();
        mockMvc.perform(get("/api/presence/trend").with(rhnWorkContext())
                        .queryParam("scopeType", "DEPARTMENT")
                        .queryParam("organizationId", ORGANIZATION)
                        .queryParam("departmentId", DEPARTMENT)
                        .queryParam("from", now.minusSeconds(300).toString())
                        .queryParam("to", now.plusSeconds(60).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scopeType").value("DEPARTMENT"))
                .andExpect(jsonPath("$.points.length()").value(1))
                .andExpect(jsonPath("$.points[0].onlineUsers").value(1))
                .andExpect(jsonPath("$.points[0].connections").value(2))
                .andExpect(jsonPath("$.points[0].instances").value(1));

        mockMvc.perform(post("/api/presence/users/{userId}/terminate", "362387869790222")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"集成测试强制下线\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revokedSessions").value(1))
                .andExpect(jsonPath("$.affectedConnections").value(2));
        mockMvc.perform(get("/api/presence/summary").with(rhnWorkContext()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("SESSION_TERMINATED"));
    }

    private MvcResult connect() throws Exception {
        return mockMvc.perform(get("/api/realtime/events").with(rhnWorkContext())
                        .accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(status().isOk())
                .andExpect(request().asyncStarted())
                .andReturn();
    }
}
