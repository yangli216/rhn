package com.rhn;

import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.util.UUID;
import java.util.stream.StreamSupport;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class QueueingWorkflowTest extends RhnIntegrationTestSupport {
    @Autowired
    JdbcTemplate jdbc;

    @Test
    void check_in_is_idempotent_and_ticket_supports_the_full_service_lifecycle() throws Exception {
        String suffix = suffix();
        String residentId = createResident(suffix);
        long sourceId = GlobalIds.next();
        String body = checkInBody("EXAM-" + suffix, "检查候诊", "EXAMINATION", "E",
                residentId, "DIAG_TASK", sourceId, 0, true, "CHECK-IN-" + suffix);

        JsonNode first = checkIn(body);
        JsonNode replay = checkIn(body);
        String ticketId = first.get("id").asText();

        assertEquals(ticketId, replay.get("id").asText());
        assertEquals(first.get("ticketCode").asText(), replay.get("ticketCode").asText());
        assertEquals(1, eventCount(ticketId));

        assertEquals("CALLED", action(ticketId, "call", "CALL-1-" + suffix).get("status").asText());
        JsonNode recalled = action(ticketId, "recall", "RECALL-" + suffix);
        assertEquals(2, recalled.get("callCount").asInt());
        JsonNode recallReplay = action(ticketId, "recall", "RECALL-" + suffix);
        assertEquals(2, recallReplay.get("callCount").asInt());
        assertEquals("MISSED", action(ticketId, "miss", "MISS-" + suffix).get("status").asText());
        JsonNode requeued = action(ticketId, "requeue", "REQUEUE-" + suffix);
        assertEquals("WAITING", requeued.get("status").asText());
        assertEquals(1, requeued.get("missedCount").asInt());
        assertEquals("CALLED", action(ticketId, "call", "CALL-2-" + suffix).get("status").asText());
        assertEquals("SERVING", action(ticketId, "start", "START-" + suffix).get("status").asText());
        assertEquals("SUSPENDED", action(ticketId, "suspend", "SUSPEND-" + suffix).get("status").asText());
        assertEquals("SERVING", action(ticketId, "resume", "RESUME-" + suffix).get("status").asText());
        JsonNode completed = action(ticketId, "complete", "COMPLETE-" + suffix);
        assertEquals("COMPLETED", completed.get("status").asText());
        assertEquals(3, completed.get("callCount").asInt());
        assertTrue(completed.hasNonNull("startedAt"));
        assertTrue(completed.hasNonNull("completedAt"));
        assertEquals(10, eventCount(ticketId));
    }

    @Test
    void ticket_query_is_server_paginated_and_call_next_uses_ready_priority_order() throws Exception {
        String suffix = suffix();
        String residentId = createResident(suffix);
        String queueCode = "LAB-" + suffix;
        JsonNode low = checkIn(checkInBody(queueCode, "检验采集", "LAB_COLLECTION", "L",
                residentId, "DIAG_TASK", GlobalIds.next(), 0, true, "LOW-" + suffix));
        JsonNode high = checkIn(checkInBody(queueCode, "检验采集", "LAB_COLLECTION", "L",
                residentId, "DIAG_TASK", GlobalIds.next(), 5, true, "HIGH-" + suffix));
        JsonNode middle = checkIn(checkInBody(queueCode, "检验采集", "LAB_COLLECTION", "L",
                residentId, "DIAG_TASK", GlobalIds.next(), 2, true, "MIDDLE-" + suffix));
        JsonNode notReady = checkIn(checkInBody(queueCode, "检验采集", "LAB_COLLECTION", "L",
                residentId, "DIAG_TASK", GlobalIds.next(), 99, false, "NOT-READY-" + suffix));
        String queueId = low.get("serviceQueueId").asText();

        JsonNode page = json(mockMvc.perform(get("/api/queueing/tickets").with(rhnWorkContext())
                        .queryParam("queueId", queueId).queryParam("status", "WAITING")
                        .queryParam("page", "0").queryParam("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(4))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(2))
                .andReturn().getResponse().getContentAsString());
        assertEquals(notReady.get("id").asText(), page.at("/content/0/id").asText());
        assertEquals(high.get("id").asText(), page.at("/content/1/id").asText());

        JsonNode firstCalled = callNext(queueId, "NEXT-1-" + suffix);
        assertEquals(high.get("id").asText(), firstCalled.get("id").asText());
        JsonNode nextReplay = callNext(queueId, "NEXT-1-" + suffix);
        assertEquals(firstCalled.get("id").asText(), nextReplay.get("id").asText());

        JsonNode secondCalled = callNext(queueId, "NEXT-2-" + suffix);
        assertEquals(middle.get("id").asText(), secondCalled.get("id").asText());
        action(notReady.get("id").asText(), "ready", "READY-" + suffix);
        JsonNode thirdCalled = callNext(queueId, "NEXT-3-" + suffix);
        assertEquals(notReady.get("id").asText(), thirdCalled.get("id").asText());
    }

    @Test
    void queue_access_is_restricted_to_the_permission_for_its_business_scene() throws Exception {
        String suffix = suffix();
        String residentId = createResident(suffix);
        JsonNode pharmacyTicket = checkIn(checkInBody("PHA-" + suffix, "药房发药", "PHARMACY", "P",
                residentId, "DISP_TASK", GlobalIds.next(), 0, true, "PHA-IN-" + suffix));
        String queueId = pharmacyTicket.get("serviceQueueId").asText();

        try {
            setPermissionActive("PHARMACY.ACCESS", false);
            JsonNode queues = json(mockMvc.perform(get("/api/queueing/queues").with(rhnWorkContext()))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString());
            assertFalse(containsId(queues, queueId));

            mockMvc.perform(get("/api/queueing/tickets").with(rhnWorkContext()).queryParam("queueId", queueId))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("SERVICE_QUEUE_SCENE_FORBIDDEN"));
        } finally {
            setPermissionActive("PHARMACY.ACCESS", true);
        }
    }

    private JsonNode checkIn(String body) throws Exception {
        return json(mockMvc.perform(post("/api/queueing/check-ins").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private JsonNode action(String ticketId, String action, String commandCode) throws Exception {
        return json(mockMvc.perform(post("/api/queueing/tickets/{ticketId}/{action}", ticketId, action)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"%s\"}".formatted(commandCode)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private JsonNode callNext(String queueId, String commandCode) throws Exception {
        return json(mockMvc.perform(post("/api/queueing/queues/{queueId}/call-next", queueId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"%s\"}".formatted(commandCode)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private String checkInBody(String queueCode, String queueName, String scene, String prefix,
                               String residentId, String sourceType, long sourceId, int priority,
                               boolean ready, String commandCode) {
        return """
                {
                  "organizationId":"%s","departmentId":"%s",
                  "queueCode":"%s","queueName":"%s","scene":"%s","ticketPrefix":"%s",
                  "residentId":"%s","sourceType":"%s","sourceId":"%d",
                  "priority":%d,"ready":%s,"commandCode":"%s"
                }
                """.formatted(ORGANIZATION, DEPARTMENT, queueCode, queueName, scene, prefix,
                residentId, sourceType, sourceId, priority, ready, commandCode);
    }

    private String createResident(String suffix) throws Exception {
        return json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"排队测试患者%s","identifiers":[{"system":"9","value":"QUEUE%s","useType":"SECONDARY"}],
                                  "gender":"FEMALE","birthDate":"1990-01-02"
                                }
                                """.formatted(suffix, suffix)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private int eventCount(String ticketId) {
        return jdbc.queryForObject("select count(*) from RHN_SC_QUEUE_TICKET_EVT where ID_QUEUE_TICKET = ?",
                Integer.class, Long.valueOf(ticketId));
    }

    private boolean containsId(JsonNode values, String id) {
        return StreamSupport.stream(values.spliterator(), false)
                .anyMatch(value -> id.equals(value.get("id").asText()));
    }

    private void setPermissionActive(String code, boolean active) {
        String validTo = active ? "null" : "current_timestamp - interval '1' day";
        jdbc.update("""
                update RHN_SYS_ROLE_PERM_ASSIGN
                   set DT_VALID_TO = %s
                 where ID_TNT = ?
                   and ID_ACC_PERM in (
                       select ID_ACC_PERM from RHN_SYS_ACC_PERM where ID_TNT = ? and CD_ACC_PERM = ?
                   )
                """.formatted(validTo), Long.valueOf(TENANT), Long.valueOf(TENANT), code);
    }

    private String suffix() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
    }
}
