package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.UUID;
import java.util.stream.StreamSupport;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class HypertensionCareSliceTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void elevated_adult_blood_pressure_creates_suspected_condition_evidenced_recheck_and_work_projection()
            throws Exception {
        String residentId = createResident("筛查居民", "1982-06-18");
        String encounterId = createActiveEncounter(residentId);

        recordClinicalData(encounterId, 152, 96).andExpect(status().isOk());

        JsonNode candidates = json(mockMvc.perform(get("/api/health-planning/hypertension-candidates")
                        .param("residentId", residentId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value("READY"))
                .andExpect(jsonPath("$[0].priority").value("HIGH"))
                .andExpect(jsonPath("$[0].conditionCode").value("I10"))
                .andExpect(jsonPath("$[0].conditionName").value("原发性高血压"))
                .andExpect(jsonPath("$[0].verificationStatus").value("SUSPECTED"))
                .andExpect(jsonPath("$[0].evidenceEvents[0].ruleCode")
                        .value("WS_T_872_2025.SUSPECTED_HYPERTENSION"))
                .andExpect(jsonPath("$[0].evidenceEvents[0].ruleVersion").value("2025-09-19"))
                .andExpect(jsonPath("$[0].evidenceEvents[0].evidence.diagnosticMeaning")
                        .value("CANDIDATE_NOT_DIAGNOSIS"))
                .andExpect(jsonPath("$[0].evidenceEvents[0].evidence.systolic.code").value("8480-6"))
                .andExpect(jsonPath("$[0].evidenceEvents[0].evidence.diastolic.code").value("8462-4"))
                .andExpect(jsonPath("$[0].evidenceEvents[0].evidenceHash")
                        .value(org.hamcrest.Matchers.matchesPattern("[0-9a-f]{64}")))
                .andReturn().getResponse().getContentAsString());
        assertEquals(1, candidates.size());
        JsonNode candidate = candidates.get(0);
        assertTrue(Instant.parse(candidate.get("dueAt").asString()).isAfter(Instant.now().plusSeconds(27L * 86400)));

        Integer observationCount = jdbcTemplate.queryForObject("""
                select count(*) from RHN_VIS_OBS where ID_TNT = ? and ID_PAT = ?
                  and CD_OBS in ('8480-6', '8462-4') and SD_STATUS = 'FINAL'
                """, Integer.class, Long.valueOf(TENANT), Long.valueOf(residentId));
        assertEquals(2, observationCount);

        JsonNode workTasks = json(mockMvc.perform(get("/api/tasks").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertTrue(StreamSupport.stream(workTasks.spliterator(), false)
                .anyMatch(task -> "CONTINUOUS_CARE".equals(task.path("taskType").asString())
                        && candidate.get("taskId").asString().equals(task.path("routePath").asString()
                        .replace("/care-management?taskId=", ""))));

        JsonNode careReminder = StreamSupport.stream(workTasks.spliterator(), false)
                .filter(task -> ("/care-management?taskId=" + candidate.get("taskId").asString())
                        .equals(task.path("routePath").asString())).findFirst().orElseThrow();
        assertEquals(candidate.get("priority").asString(), careReminder.get("priority").asString());
        assertEquals(Instant.parse(candidate.get("dueAt").asString()), Instant.parse(careReminder.get("dueAt").asString()));
        assertEquals(candidate.get("title").asString(), careReminder.get("title").asString());
        mockMvc.perform(post("/api/tasks/{id}/complete", careReminder.get("id").asString()).with(rhnWorkContext()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TASK_BUSINESS_ACTION_REQUIRED"));
        mockMvc.perform(get("/api/tasks").with(rhnWorkContext()))
                .andExpect(jsonPath("$[?(@.id == '%s')].status".formatted(careReminder.get("id").asString())).value("READY"));

        recordClinicalData(encounterId, 148, 94).andExpect(status().isOk());
        mockMvc.perform(get("/api/health-planning/hypertension-candidates")
                        .param("residentId", residentId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].evidenceEvents.length()").value(2));
    }

    @Test
    void normal_or_minor_blood_pressure_is_structured_without_creating_a_candidate() throws Exception {
        String residentId = createResident("正常血压居民", "1991-02-03");
        String encounterId = createActiveEncounter(residentId);

        recordClinicalData(encounterId, 128, 78).andExpect(status().isOk());

        mockMvc.perform(get("/api/health-planning/hypertension-candidates")
                        .param("residentId", residentId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
        assertEquals(2, jdbcTemplate.queryForObject("""
                select count(*) from RHN_VIS_OBS where ID_TNT = ? and ID_PAT = ?
                  and CD_OBS in ('8480-6', '8462-4')
                """, Integer.class, Long.valueOf(TENANT), Long.valueOf(residentId)));
    }

    @Test
    void severe_single_reading_requires_urgent_recheck_but_remains_unconfirmed() throws Exception {
        String residentId = createResident("显著升高居民", "1970-03-08");
        String encounterId = createActiveEncounter(residentId);

        recordClinicalData(encounterId, 181, 108).andExpect(status().isOk());

        JsonNode candidate = json(mockMvc.perform(get("/api/health-planning/hypertension-candidates")
                        .param("residentId", residentId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].priority").value("URGENT"))
                .andExpect(jsonPath("$[0].title").value("血压显著升高：立即复测并评估转诊"))
                .andExpect(jsonPath("$[0].verificationStatus").value("SUSPECTED"))
                .andExpect(jsonPath("$[0].evidenceEvents[0].evidence.decision").value("URGENT_RECHECK"))
                .andReturn().getResponse().getContentAsString()).get(0);
        assertFalse(Instant.parse(candidate.get("dueAt").asString()).isAfter(Instant.now().plusSeconds(5)));
    }

    @Test
    void child_measurement_does_not_enter_adult_hypertension_screening() throws Exception {
        String residentId = createResident("儿童居民", "2014-04-06");
        String encounterId = createActiveEncounter(residentId);

        recordClinicalData(encounterId, 145, 92).andExpect(status().isOk());

        mockMvc.perform(get("/api/health-planning/hypertension-candidates")
                        .param("residentId", residentId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void subsequent_urgent_evidence_updates_the_original_task_and_claimed_work_reminder_without_downgrading()
            throws Exception {
        String residentId = createResident("紧急程度变化居民", "1980-06-18");
        String encounterId = createActiveEncounter(residentId);
        recordClinicalData(encounterId, 152, 96).andExpect(status().isOk());
        JsonNode initial = candidate(residentId);
        JsonNode reminder = reminder(initial.get("taskId").asString());
        String reminderId = reminder.get("id").asString();
        mockMvc.perform(post("/api/tasks/{id}/claim", reminderId).with(rhnWorkContext()))
                .andExpect(status().isOk());

        recordClinicalData(encounterId, 181, 108).andExpect(status().isOk());
        JsonNode urgent = candidate(residentId);
        assertEquals(initial.get("taskId").asString(), urgent.get("taskId").asString());
        assertEquals("URGENT", urgent.get("priority").asString());
        assertEquals("SUSPECTED", urgent.get("verificationStatus").asString());
        assertTrue(Instant.parse(urgent.get("dueAt").asString()).isBefore(Instant.parse(initial.get("dueAt").asString())));
        assertEquals(urgent.get("dueAt").asString(), urgent.get("evidenceEvents").get(1)
                .get("evidence").get("recheckDueAt").asString());
        JsonNode projected = reminder(urgent.get("taskId").asString());
        assertEquals(reminderId, projected.get("id").asString());
        assertEquals("URGENT", projected.get("priority").asString());
        assertEquals("IN_PROGRESS", projected.get("status").asString());
        assertEquals(urgent.get("title").asString(), projected.get("title").asString());
        assertEquals(Instant.parse(urgent.get("dueAt").asString()), Instant.parse(projected.get("dueAt").asString()));

        recordClinicalData(encounterId, 185, 112).andExpect(status().isOk());
        recordClinicalData(encounterId, 148, 94).andExpect(status().isOk());
        JsonNode later = candidate(residentId);
        assertEquals("URGENT", later.get("priority").asString());
        assertEquals(urgent.get("dueAt").asString(), later.get("dueAt").asString());
        assertEquals(4, later.get("evidenceEvents").size());
        assertEquals("URGENT", reminder(later.get("taskId").asString()).get("priority").asString());
    }

    private JsonNode candidate(String residentId) throws Exception {
        JsonNode values = json(mockMvc.perform(get("/api/health-planning/hypertension-candidates")
                        .param("residentId", residentId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(1, values.size());
        return values.get(0);
    }

    private JsonNode reminder(String careTaskId) throws Exception {
        JsonNode values = json(mockMvc.perform(get("/api/tasks").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var matches = StreamSupport.stream(values.spliterator(), false)
                .filter(task -> ("/care-management?taskId=" + careTaskId).equals(task.path("routePath").asString())).toList();
        assertEquals(1, matches.size());
        return matches.get(0);
    }

    private String createResident(String name, String birthDate) throws Exception {
        String externalId = "M4" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        return json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"%s","identifiers":[{"system":"9","value":"%s","useType":"SECONDARY"}],"gender":"FEMALE",
                                  "birthDate":"%s","phone":"13800138009"
                                }
                                """.formatted(name, externalId, birthDate)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
    }

    private String createActiveEncounter(String residentId) throws Exception {
        String encounterId = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        mockMvc.perform(verifiedEncounterStart(encounterId))
                .andExpect(status().isOk());
        return encounterId;
    }

    private org.springframework.test.web.servlet.ResultActions recordClinicalData(
            String encounterId, int systolic, int diastolic) throws Exception {
        return mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounterId)
                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                        {
                          "chiefComplaint":"血压筛查","systolic":%d,"diastolic":%d,
                          "diagnoses":[{"code":"R05","display":"咳嗽","type":"PRIMARY"}]
                        }
                        """.formatted(systolic, diastolic)));
    }
}
