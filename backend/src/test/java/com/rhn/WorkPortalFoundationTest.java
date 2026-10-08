package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.util.stream.StreamSupport;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class WorkPortalFoundationTest extends RhnIntegrationTestSupport {
    @org.springframework.beans.factory.annotation.Autowired
    org.springframework.jdbc.core.JdbcTemplate jdbc;


    @Test
    void trusted_context_tasks_notifications_and_portal_summary_form_a_closed_loop() throws Exception {
        mockMvc.perform(get("/api/session").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.refreshLoginEnabled").value(false))
                .andExpect(jsonPath("$.userId").value("362387869790222"))
                .andExpect(jsonPath("$.workContexts[?(@.departmentId == '%s')].organizationId"
                        .formatted(DEPARTMENT)).value(ORGANIZATION))
                .andExpect(jsonPath("$.workContexts[?(@.departmentId == '%s')].workContextType"
                        .formatted(DEPARTMENT)).value("CLINICAL"));

        mockMvc.perform(get("/api/portal/summary").with(rhn()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("WORK_CONTEXT_REQUIRED"));

        String residentBody = mockMvc.perform(post("/api/residents")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName":"任务居民",
                                  "identifiers":[{"system":"9","value":"330102198801011237","useType":"SECONDARY"}],
                                  "gender":"FEMALE",
                                  "birthDate":"1988-01-01",
                                  "phone":"13800138009"
                                }
                                """))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String residentId = objectMapper.readTree(residentBody).get("id").asString();

        String encounterBody = mockMvc.perform(post("/api/encounters")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String encounterId = objectMapper.readTree(encounterBody).get("id").asString();

        String tasks = mockMvc.perform(get("/api/tasks").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andReturn().getResponse().getContentAsString();
        JsonNode task = StreamSupport.stream(objectMapper.readTree(tasks).spliterator(), false)
                .filter(node -> encounterId.equals(node.path("encounterId").asString()))
                .findFirst()
                .orElseThrow();
        String taskId = task.get("id").asString();
        org.junit.jupiter.api.Assertions.assertTrue(task.path("dueAt").isMissingNode() || task.path("dueAt").isNull());

        mockMvc.perform(post("/api/tasks/{id}/claim", taskId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_PROGRESS"));
        mockMvc.perform(post("/api/tasks/{id}/complete", taskId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TASK_BUSINESS_ACTION_REQUIRED"));
        mockMvc.perform(get("/api/tasks").with(rhnWorkContext()))
                .andExpect(jsonPath("$[?(@.id == '%s')].status".formatted(taskId)).value("IN_PROGRESS"));
        mockMvc.perform(verifiedEncounterStart(encounterId)).andExpect(status().isOk());
        org.junit.jupiter.api.Assertions.assertEquals(1, jdbc.queryForObject("""
                select count(*) from RHN_SYS_WORK_TASK t join RHN_VIS_ENC e
                  on e.ID_TNT = t.ID_TNT and e.ID_ENC = t.ID_SRC
                 where t.ID_WORK_TASK = ? and t.SD_STATUS = 'COMPLETED'
                   and t.DT_CMPLD = e.DT_STARTED and t.ID_USER_CMPLD = ?
                """, Integer.class, Long.valueOf(taskId), 362387869790222L));
        mockMvc.perform(get("/api/tasks").with(rhnWorkContext()))
                .andExpect(jsonPath("$[?(@.id == '%s')]".formatted(taskId)).isEmpty());

        mockMvc.perform(get("/api/notifications").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value("UNREAD"));

        mockMvc.perform(get("/api/portal/summary").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tasks.totalOpen").isNumber())
                .andExpect(jsonPath("$.notifications.unread").isNumber())
                .andExpect(jsonPath("$.registeredToday").isNumber());
    }

    @Test
    void forged_department_context_is_rejected() throws Exception {
        mockMvc.perform(get("/api/tasks")
                        .with(rhn())
                        .header("X-Organization-Id", ORGANIZATION)
                        .header("X-Department-Id", "362387869790211"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("WORK_CONTEXT_FORBIDDEN"));
    }
}
