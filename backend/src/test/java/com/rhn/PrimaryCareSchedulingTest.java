package com.rhn;

import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PrimaryCareSchedulingTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void simple_mode_generates_published_schedules_and_shared_pools_idempotently() throws Exception {
        mockMvc.perform(get("/api/outpatient/scheduling/bootstrap").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sdManagementMode").value("SIMPLE"))
                .andExpect(jsonPath("$.sdManagementModeText").value("简易模式"))
                .andExpect(jsonPath("$.defaultCapacity").value(50))
                .andExpect(jsonPath("$.defaultGenerateDays").value(28))
                .andExpect(jsonPath("$.morning.start").value("08:00:00"))
                .andExpect(jsonPath("$.practitioners[?(@.id == '362387869790223')].name")
                        .value("示范全科医生"));

        LocalDate monday = LocalDate.now().with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY));
        LocalDate sunday = monday.plusDays(6);
        String requestCode = "test-schedule-" + GlobalIds.next();
        String body = """
                {
                  "practitionerId":"362387869790223",
                  "catalogItemId":"362387869795104",
                  "dateFrom":"%s",
                  "dateTo":"%s",
                  "weekdays":[1],
                  "dayParts":["MORNING","AFTERNOON"],
                  "morningStart":"08:00",
                  "morningEnd":"12:00",
                  "afternoonStart":"14:00",
                  "afternoonEnd":"17:00",
                  "capacity":30,
                  "locationName":"全科门诊一诊室",
                  "idempotencyCode":"%s"
                }
                """.formatted(monday, sunday, requestCode);

        String response = mockMvc.perform(post("/api/outpatient/scheduling/quick-schedules")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.replayed").value(false))
                .andExpect(jsonPath("$.generatedCount").value(2))
                .andExpect(jsonPath("$.skippedCount").value(0))
                .andExpect(jsonPath("$.schedules.length()").value(2))
                .andExpect(jsonPath("$.schedules[0].sdStatusText").value("可预约"))
                .andExpect(jsonPath("$.schedules[0].sdBookingPolicyText").value("共享号源"))
                .andExpect(jsonPath("$.schedules[0].sdSlotModeText").value("号池模式"))
                .andExpect(jsonPath("$.schedules[0].totalCount").value(30))
                .andExpect(jsonPath("$.schedules[0].availableCount").value(30))
                .andReturn().getResponse().getContentAsString();
        String generationRunId = json(response).get("generationRunId").asString();
        String morningScheduleId = json(response).at("/schedules/0/id").asString();
        String afternoonScheduleId = json(response).at("/schedules/1/id").asString();

        mockMvc.perform(post("/api/outpatient/scheduling/quick-schedules")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.replayed").value(true))
                .andExpect(jsonPath("$.generationRunId").value(generationRunId))
                .andExpect(jsonPath("$.schedules.length()").value(2));

        mockMvc.perform(get("/api/outpatient/scheduling/schedules")
                        .with(rhnWorkContext()).queryParam("dateFrom", monday.toString())
                        .queryParam("dateTo", sunday.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].practitionerId").value("362387869790223"))
                .andExpect(jsonPath("$[1].locationName").value("全科门诊一诊室"));

        String updateCommandCode = "test-schedule-update-" + GlobalIds.next();
        String updateBody = """
                {
                  "startTime":"08:00",
                  "endTime":"12:00",
                  "capacity":35,
                  "locationName":"全科门诊二诊室",
                  "commandCode":"%s",
                  "reason":"测试调整门诊容量"
                }
                """.formatted(updateCommandCode);
        mockMvc.perform(put("/api/outpatient/scheduling/schedules/{scheduleId}", morningScheduleId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(updateBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCount").value(35))
                .andExpect(jsonPath("$.availableCount").value(35))
                .andExpect(jsonPath("$.locationName").value("全科门诊二诊室"));
        mockMvc.perform(put("/api/outpatient/scheduling/schedules/{scheduleId}", morningScheduleId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(updateBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCount").value(35));

        performAction(morningScheduleId, "SUSPEND", "暂停接诊").andExpect(status().isOk())
                .andExpect(jsonPath("$.sdStatus").value("SUSPENDED"))
                .andExpect(jsonPath("$.sdStatusText").value("已停诊"));
        performAction(morningScheduleId, "RESUME", "恢复接诊").andExpect(status().isOk())
                .andExpect(jsonPath("$.sdStatus").value("PUBLISHED"))
                .andExpect(jsonPath("$.sdStatusText").value("可预约"));
        performAction(afternoonScheduleId, "CANCEL", "当日停诊").andExpect(status().isOk())
                .andExpect(jsonPath("$.sdStatus").value("CANCELLED"))
                .andExpect(jsonPath("$.sdStatusText").value("已取消"));

        String overlappingBody = body
                .replace(requestCode, "test-schedule-overlap-" + GlobalIds.next())
                .replace("[\"MORNING\",\"AFTERNOON\"]", "[\"MORNING\"]");
        mockMvc.perform(post("/api/outpatient/scheduling/quick-schedules")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(overlappingBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.generatedCount").value(0))
                .andExpect(jsonPath("$.skippedCount").value(1));

        String invalidLaboratoryBody = body
                .replace("362387869795104", "362387869795101")
                .replace(requestCode, "test-invalid-laboratory-" + GlobalIds.next());
        mockMvc.perform(post("/api/outpatient/scheduling/quick-schedules")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(invalidLaboratoryBody))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("SCHEDULE_SERVICE_CATEGORY_INVALID"));

        Long morningId = Long.valueOf(morningScheduleId);
        Long afternoonId = Long.valueOf(afternoonScheduleId);
        assertEquals(2, jdbcTemplate.queryForObject(
                "select count(*) from RHN_SC_SCHED_SLOT_POOL where ID_TNT = ? and ID_SVC_SCHED in (?, ?)",
                Integer.class, Long.valueOf(TENANT), morningId, afternoonId));
        assertEquals(6, jdbcTemplate.queryForObject(
                "select count(*) from RHN_SC_SVC_SCHED_EVT where ID_TNT = ? and ID_SVC_SCHED in (?, ?)",
                Integer.class, Long.valueOf(TENANT), morningId, afternoonId));
        assertEquals(6, jdbcTemplate.queryForObject(
                "select count(*) from RHN_SC_SLOT_EVT where ID_TNT = ? and ID_SVC_SCHED in (?, ?)",
                Integer.class, Long.valueOf(TENANT), morningId, afternoonId));
        assertEquals(1, jdbcTemplate.queryForObject(
                "select count(*) from RHN_SC_SCHED_SLOT_POOL where ID_TNT = ? and ID_SVC_SCHED in (?, ?) and SD_STATUS = 'ACTIVE'",
                Integer.class, Long.valueOf(TENANT), morningId, afternoonId));
        assertEquals(1, jdbcTemplate.queryForObject(
                "select count(*) from RHN_SC_SCHED_SLOT_POOL where ID_TNT = ? and ID_SVC_SCHED in (?, ?) and SD_STATUS = 'CLOSED'",
                Integer.class, Long.valueOf(TENANT), morningId, afternoonId));
    }

    @Test
    void department_scoped_inventory_does_not_require_a_practitioner() throws Exception {
        LocalDate monday = LocalDate.now().with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY)).plusWeeks(3);
        String command = "test-department-schedule-" + GlobalIds.next();
        String body = """
                {
                  "registrationScope":"DEPARTMENT",
                  "catalogItemId":"362387869795104",
                  "dateFrom":"%s",
                  "dateTo":"%s",
                  "weekdays":[1],
                  "dayParts":["MORNING"],
                  "morningStart":"08:00",
                  "morningEnd":"12:00",
                  "afternoonStart":"14:00",
                  "afternoonEnd":"17:00",
                  "capacity":50,
                  "locationName":"全科普通门诊",
                  "idempotencyCode":"%s"
                }
                """.formatted(monday, monday, command);

        String response = mockMvc.perform(post("/api/outpatient/scheduling/quick-schedules")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.generatedCount").value(1))
                .andExpect(jsonPath("$.schedules[0].sdRegistrationScope").value("DEPARTMENT"))
                .andExpect(jsonPath("$.schedules[0].sdRegistrationScopeText").value("科室号"))
                .andExpect(jsonPath("$.schedules[0].practitionerId").doesNotExist())
                .andExpect(jsonPath("$.schedules[0].feeConfigured").value(true))
                .andExpect(jsonPath("$.schedules[0].registrationFee").value(10.0))
                .andReturn().getResponse().getContentAsString();

        Long scheduleId = Long.valueOf(json(response).at("/schedules/0/id").asString());
        assertEquals("DEPARTMENT", jdbcTemplate.queryForObject(
                "select SD_REG_SCOPE from RHN_SC_SVC_SCHED where ID_TNT = ? and ID_SVC_SCHED = ?",
                String.class, Long.valueOf(TENANT), scheduleId));
        assertEquals(0, jdbcTemplate.queryForObject(
                "select count(*) from RHN_SC_SVC_SCHED where ID_SVC_SCHED = ? and ID_PRACT is not null",
                Integer.class, scheduleId));
    }

    private org.springframework.test.web.servlet.ResultActions performAction(
            String scheduleId, String action, String reason) throws Exception {
        String body = """
                {
                  "action":"%s",
                  "commandCode":"test-schedule-action-%s",
                  "reason":"%s"
                }
                """.formatted(action, GlobalIds.next(), reason);
        return mockMvc.perform(post("/api/outpatient/scheduling/schedules/{scheduleId}/actions", scheduleId)
                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body));
    }
}
