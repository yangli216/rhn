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
                  "catalogItemId":"362387869795101",
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
        String generationRunId = json(response).get("generationRunId").asText();

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

        assertEquals(2, jdbcTemplate.queryForObject(
                "select count(*) from schedule_slot_pools where tenant_id = ?", Integer.class, Long.valueOf(TENANT)));
        assertEquals(2, jdbcTemplate.queryForObject(
                "select count(*) from service_schedule_events where tenant_id = ?", Integer.class, Long.valueOf(TENANT)));
        assertEquals(2, jdbcTemplate.queryForObject(
                "select count(*) from slot_events where tenant_id = ?", Integer.class, Long.valueOf(TENANT)));
    }
}
