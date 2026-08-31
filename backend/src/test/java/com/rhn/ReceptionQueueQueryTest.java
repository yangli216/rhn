package com.rhn;

import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.stream.StreamSupport;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ReceptionQueueQueryTest extends RhnIntegrationTestSupport {
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Test
    void queue_accepts_either_registration_or_reception_permission_and_rejects_unrelated_users() throws Exception {
        try {
            setPermissionActive("OUTPATIENT_RECEPTION.ACCESS", false);
            mockMvc.perform(get("/api/outpatient/reception/queue").with(rhnWorkContext()))
                    .andExpect(status().isOk());

            setPermissionActive("OUTPATIENT_RECEPTION.ACCESS", true);
            setPermissionActive("OUTPATIENT_REGISTRATION.ACCESS", false);
            mockMvc.perform(get("/api/outpatient/reception/queue").with(rhnWorkContext()))
                    .andExpect(status().isOk());

            setPermissionActive("OUTPATIENT_RECEPTION.ACCESS", false);
            mockMvc.perform(get("/api/outpatient/reception/queue").with(rhnWorkContext()))
                    .andExpect(status().isForbidden());
        } finally {
            setPermissionActive("OUTPATIENT_REGISTRATION.ACCESS", true);
            setPermissionActive("OUTPATIENT_RECEPTION.ACCESS", true);
        }
    }

    @Test
    void queue_uses_a_half_open_business_day_range() throws Exception {
        String suffix = Long.toString(GlobalIds.next()).substring(13);
        JsonNode resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"挂号日期边界患者%s","nationalId":"33010219900102%s",
                                  "gender":"FEMALE","birthDate":"1990-01-02","phone":"13800138086"
                                }
                                """.formatted(suffix, suffix)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "idempotencyCode":"QUEUE-DATE-%s"
                                }
                                """.formatted(resident.get("id").asText(), ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        String registrationId = encounter.get("registrationId").asText();
        LocalDate queriedDate = LocalDate.now(BUSINESS_ZONE).minusDays(2);
        Instant nextDayStart = queriedDate.plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant();
        jdbcTemplate.update("update patient_registrations set registered_at = ? where id = ?",
                nextDayStart, Long.valueOf(registrationId));

        JsonNode firstDay = queue(queriedDate);
        JsonNode nextDay = queue(queriedDate.plusDays(1));

        assertFalse(containsRegistration(firstDay, registrationId));
        assertTrue(containsRegistration(nextDay, registrationId));
    }

    private JsonNode queue(LocalDate date) throws Exception {
        return json(mockMvc.perform(get("/api/outpatient/reception/queue").with(rhnWorkContext())
                        .queryParam("date", date.toString()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private boolean containsRegistration(JsonNode registrations, String registrationId) {
        return StreamSupport.stream(registrations.spliterator(), false)
                .anyMatch(value -> registrationId.equals(value.get("registrationId").asText()));
    }

    private void setPermissionActive(String code, boolean active) {
        String validTo = active ? "null" : "current_timestamp - interval '1' day";
        jdbcTemplate.update("""
                update role_permission_assignments
                   set valid_to = %s
                 where tenant_id = ?
                   and permission_id in (
                       select id from access_permissions where tenant_id = ? and code = ?
                   )
                """.formatted(validTo), Long.valueOf(TENANT), Long.valueOf(TENANT), code);
    }
}
