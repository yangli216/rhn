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

class ProfessionalSchedulingTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;

    @Test
    void creates_timed_professional_template_with_closed_and_override_exceptions_idempotently() throws Exception {
        jdbc.update("""
                insert into RHN_SYS_PARAM_VAL (
                    ID_PARAM_VAL, ID_PARAM_DEF, ID_TNT, SD_SCOPE_TYPE, ID_SCOPE, SCOPE_REFERENCE, CD_SCOPE,
                    SD_VAL_MODE, JSON_VAL, SECRET_REF, FG_ACTIVE, REVISION,
                    DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED
                ) values (?, 362387869795020, ?, 'DEPARTMENT', ?, null, ?,
                    'OVERRIDE', '\"PROFESSIONAL\"', null, true, 0,
                    current_timestamp, 362387869790222, current_timestamp, 362387869790222)
                """, GlobalIds.next(), Long.valueOf(TENANT), Long.valueOf(DEPARTMENT),
                "DEPARTMENT:" + DEPARTMENT);
        LocalDate tuesday = LocalDate.now().plusWeeks(2)
                .with(TemporalAdjusters.nextOrSame(DayOfWeek.TUESDAY));
        LocalDate wednesday = tuesday.plusDays(1);
        LocalDate thursday = tuesday.plusDays(2);
        String commandCode = "PRO-SCHEDULE-" + GlobalIds.next();
        String body = """
                {
                  "templateName":"全科分时预约模板",
                  "practitionerId":"362387869790223",
                  "catalogItemId":"362387869795104",
                  "dateFrom":"%s",
                  "dateTo":"%s",
                  "weekdays":[2,3,4],
                  "startTime":"08:00",
                  "endTime":"09:00",
                  "capacity":1,
                  "slotMode":"TIMED",
                  "slotMinutes":30,
                  "locationName":"全科分时诊室",
                  "exceptions":[
                    {"exceptionDate":"%s","exceptionType":"CLOSED","reason":"院内培训停诊"},
                    {"exceptionDate":"%s","exceptionType":"OVERRIDE","startTime":"10:00",
                     "endTime":"11:00","capacity":2,"slotMinutes":30,"reason":"临时调整出诊时间"}
                  ],
                  "idempotencyCode":"%s"
                }
                """.formatted(tuesday, thursday, wednesday, thursday, commandCode);

        String response = mockMvc.perform(post("/api/outpatient/scheduling/professional/templates")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.replayed").value(false))
                .andExpect(jsonPath("$.generatedCount").value(4))
                .andExpect(jsonPath("$.skippedCount").value(0))
                .andExpect(jsonPath("$.template.templateName").value("全科分时预约模板"))
                .andExpect(jsonPath("$.template.periods.length()").value(3))
                .andExpect(jsonPath("$.template.periods[0].sdSlotMode").value("TIMED"))
                .andExpect(jsonPath("$.template.periods[0].sdSlotModeText").value("分时模式"))
                .andExpect(jsonPath("$.template.exceptions.length()").value(2))
                .andExpect(jsonPath("$.schedules.length()").value(4))
                .andExpect(jsonPath("$.schedules[0].sdManagementMode").value("PROFESSIONAL"))
                .andExpect(jsonPath("$.schedules[0].sdSlotMode").value("TIMED"))
                .andExpect(jsonPath("$.schedules[0].totalCount").value(1))
                .andExpect(jsonPath("$.schedules[2].totalCount").value(2))
                .andReturn().getResponse().getContentAsString();
        String templateId = json(response).at("/template/id").asText();

        mockMvc.perform(post("/api/outpatient/scheduling/professional/templates")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.replayed").value(true))
                .andExpect(jsonPath("$.template.id").value(templateId))
                .andExpect(jsonPath("$.schedules.length()").value(4));

        mockMvc.perform(get("/api/outpatient/scheduling/professional/templates").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '%s')].templateName".formatted(templateId))
                        .value("全科分时预约模板"));

        assertEquals(2, jdbc.queryForObject(
                "select count(*) from RHN_SC_SCHED_EXCEPT where ID_SCHED_TMPL = ?", Integer.class,
                Long.valueOf(templateId)));
        assertEquals(4, jdbc.queryForObject(
                "select count(*) from RHN_SC_SVC_SCHED where ID_SCHED_TMPL = ? and SD_MGMT_MODE = 'PROFESSIONAL'",
                Integer.class, Long.valueOf(templateId)));
        assertEquals(4, jdbc.queryForObject("""
                select count(*) from RHN_SC_SCHED_SLOT_POOL p
                join RHN_SC_SVC_SCHED s on s.ID_TNT = p.ID_TNT and s.ID_SVC_SCHED = p.ID_SVC_SCHED
                where s.ID_SCHED_TMPL = ? and p.SD_SLOT_MODE = 'TIMED'
                """, Integer.class, Long.valueOf(templateId)));
    }
}
