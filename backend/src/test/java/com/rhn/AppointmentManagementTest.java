package com.rhn;

import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("outpatient-main-flow")
class AppointmentManagementTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;

    @Test
    void books_lists_reschedules_and_cancels_with_shared_inventory_and_events() throws Exception {
        String suffix = Long.toString(Math.floorMod(GlobalIds.next(), 1_000_000));
        String residentId = createResident(suffix);
        LocalDate serviceDate = LocalDate.now().plusDays(1);
        JsonNode schedules = createSchedules(serviceDate, suffix);
        String morningId = schedules.at("/schedules/0/id").asText();
        String afternoonId = schedules.at("/schedules/1/id").asText();
        String bookingCode = "APPT-BOOK-" + suffix;
        String createBody = """
                {
                  "residentId":"%s","scheduleId":"%s","bookingSource":"PHONE",
                  "reason":"居民来电预约","idempotencyCode":"%s"
                }
                """.formatted(residentId, morningId, bookingCode);

        JsonNode booked = json(mockMvc.perform(post("/api/outpatient/appointments")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(createBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sdStatus").value("BOOKED"))
                .andExpect(jsonPath("$.sdStatusText").value("待就诊"))
                .andExpect(jsonPath("$.sdBookingSourceText").value("电话预约"))
                .andExpect(jsonPath("$.residentName").value("预约管理患者" + suffix))
                .andReturn().getResponse().getContentAsString());
        String originalId = booked.get("id").asText();

        mockMvc.perform(post("/api/outpatient/appointments")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(createBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(originalId));
        mockMvc.perform(get("/api/outpatient/appointments").with(rhnWorkContext())
                        .queryParam("dateFrom", serviceDate.toString())
                        .queryParam("dateTo", serviceDate.toString())
                        .queryParam("status", "BOOKED")
                        .queryParam("query", "预约管理患者"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(originalId));
        assertPool(morningId, 1);

        String rescheduleCode = "APPT-MOVE-" + suffix;
        String rescheduleBody = """
                {"targetScheduleId":"%s","commandCode":"%s","reason":"居民调整就诊时间"}
                """.formatted(afternoonId, rescheduleCode);
        JsonNode replacement = json(mockMvc.perform(post(
                                "/api/outpatient/appointments/{appointmentId}/reschedule", originalId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(rescheduleBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sdStatus").value("BOOKED"))
                .andExpect(jsonPath("$.scheduleId").value(afternoonId))
                .andExpect(jsonPath("$.rescheduledFromId").value(originalId))
                .andReturn().getResponse().getContentAsString());
        String replacementId = replacement.get("id").asText();
        mockMvc.perform(post("/api/outpatient/appointments/{appointmentId}/reschedule", originalId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(rescheduleBody))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(replacementId));
        assertPool(morningId, 0);
        assertPool(afternoonId, 1);
        assertEquals("CANCELLED", jdbc.queryForObject("select SD_STATUS as status from RHN_SC_APPT where ID_APPT = ?",
                String.class, Long.valueOf(originalId)));

        String cancelBody = """
                {"commandCode":"APPT-CANCEL-%s","reason":"居民取消就诊计划"}
                """.formatted(suffix);
        mockMvc.perform(post("/api/outpatient/appointments/{appointmentId}/cancel", replacementId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(cancelBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sdStatus").value("CANCELLED"))
                .andExpect(jsonPath("$.cancellationReason").value("居民取消就诊计划"));
        mockMvc.perform(post("/api/outpatient/appointments/{appointmentId}/cancel", replacementId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(cancelBody))
                .andExpect(status().isOk()).andExpect(jsonPath("$.sdStatus").value("CANCELLED"));
        assertPool(afternoonId, 0);
        assertEquals(4, jdbc.queryForObject(
                "select count(*) from RHN_SC_APPT_EVT where ID_APPT in (?, ?)", Integer.class,
                Long.valueOf(originalId), Long.valueOf(replacementId)));
    }

    @Test
    void booked_appointment_converts_to_registration_without_occupying_a_second_slot() throws Exception {
        String suffix = "C" + Long.toString(Math.floorMod(GlobalIds.next(), 1_000_000));
        String residentId = createResident(suffix);
        LocalDate scheduleDate = LocalDate.now().plusDays(4);
        String scheduleId = createSchedules(scheduleDate, suffix).at("/schedules/0/id").asText();
        JsonNode appointment = json(mockMvc.perform(post("/api/outpatient/appointments")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","scheduleId":"%s","bookingSource":"WINDOW",
                                 "idempotencyCode":"APPT-CHECKIN-%s"}
                                """.formatted(residentId, scheduleId, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String appointmentId = appointment.get("id").asText();
        assertPool(scheduleId, 1);

        jdbc.update("update RHN_SC_SVC_SCHED set DA_SVC = ? where ID_SVC_SCHED = ?",
                LocalDate.now(), Long.valueOf(scheduleId));
        jdbc.update("update RHN_BD_CATALOG_ITEM set FG_CHARGEABLE = false where ID_CATALOG_ITEM = ?", 362387869795104L);
        JsonNode completed = json(mockMvc.perform(post("/api/billing/registration-intents")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s",
                                 "appointmentId":"%s","idempotencyCode":"REG-APPT-%s",
                                 "registrationSource":"WINDOW","visitType":"GENERAL"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, appointmentId, suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.appointmentId").value(appointmentId))
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.slotHoldId").doesNotExist())
                .andReturn().getResponse().getContentAsString());

        assertPool(scheduleId, 1);
        assertEquals("REGISTERED", jdbc.queryForObject("select SD_STATUS as status from RHN_SC_APPT where ID_APPT = ?",
                String.class, Long.valueOf(appointmentId)));
        assertEquals(1, jdbc.queryForObject(
                "select count(*) from RHN_SC_PAT_REG where ID_APPT = ? and ID_ENC = ?",
                Integer.class, Long.valueOf(appointmentId), completed.get("encounterId").asLong()));
        assertEquals(1, jdbc.queryForObject(
                "select count(*) from RHN_SC_APPT_EVT where ID_APPT = ? and SD_EVT_TYPE = 'REGISTERED'",
                Integer.class, Long.valueOf(appointmentId)));
    }

    private String createResident(String suffix) throws Exception {
        String digits = "%06d".formatted(Math.floorMod(suffix.hashCode(), 1_000_000));
        return json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"预约管理患者%s","identifiers":[{"system":"9","value":"33010219900101%s","useType":"SECONDARY"}],
                                 "gender":"FEMALE","birthDate":"1990-01-01"}
                                """.formatted(suffix, digits)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private JsonNode createSchedules(LocalDate date, String suffix) throws Exception {
        return json(mockMvc.perform(post("/api/outpatient/scheduling/quick-schedules")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "practitionerId":"362387869790223","catalogItemId":"362387869795104",
                                  "dateFrom":"%s","dateTo":"%s","weekdays":[%d],
                                  "dayParts":["MORNING","AFTERNOON"],
                                  "morningStart":"08:00","morningEnd":"12:00",
                                  "afternoonStart":"14:00","afternoonEnd":"17:00",
                                  "capacity":1,"locationName":"预约管理诊室",
                                  "idempotencyCode":"APPT-SCHEDULE-%s"
                                }
                                """.formatted(date, date, date.getDayOfWeek().getValue(), suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.generatedCount").value(2))
                .andReturn().getResponse().getContentAsString());
    }

    private void assertPool(String scheduleId, int occupied) {
        assertEquals(occupied, jdbc.queryForObject(
                "select QTY_OCCUPIED from RHN_SC_SCHED_SLOT_POOL where ID_SVC_SCHED = ?",
                Integer.class, Long.valueOf(scheduleId)));
    }
}
