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
                                  "fullName":"挂号日期边界患者%s","identifiers":[{"system":"9","value":"QUEUE-DATE-%s","useType":"SECONDARY"}],
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
        jdbcTemplate.update("update RHN_SC_PAT_REG set DT_REGISTERED = ? where ID_PAT_REG = ?",
                nextDayStart, Long.valueOf(registrationId));

        JsonNode firstDay = queue(queriedDate);
        JsonNode nextDay = queue(queriedDate.plusDays(1));

        assertFalse(containsRegistration(firstDay, registrationId));
        assertTrue(containsRegistration(nextDay, registrationId));
    }

    @Test
    void page_supports_pagination_and_filters() throws Exception {
        String suffix = Long.toString(GlobalIds.next()).substring(13);
        JsonNode resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"分页测试患者%s","identifiers":[{"system":"9","value":"QUEUE-PAGE-%s","useType":"SECONDARY"}],
                                  "gender":"FEMALE","birthDate":"1990-01-02","phone":"13800138099"
                                }
                                """.formatted(suffix, suffix)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "idempotencyCode":"PAGE-TEST-%s"
                                }
                                """.formatted(resident.get("id").asText(), ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        String registrationId = encounter.get("registrationId").asText();

        // 验证基本分页返回
        JsonNode pageResp = json(mockMvc.perform(get("/api/outpatient/reception/page").with(rhnWorkContext())
                        .queryParam("page", "0")
                        .queryParam("size", "10"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        assertTrue(pageResp.has("content"));
        assertTrue(pageResp.has("page"));
        assertTrue(pageResp.has("size"));
        assertTrue(pageResp.has("totalElements"));
        assertTrue(pageResp.has("totalPages"));
        assertTrue(pageResp.get("totalElements").asLong() >= 1);
        assertTrue(containsRegistration(pageResp.get("content"), registrationId));
        JsonNode firstItem = pageResp.get("content").get(0);
        assertTrue(firstItem.has("registeredByName"));
        assertTrue(firstItem.has("departmentName"));

        // 验证带关键词查询
        JsonNode queryMatch = json(mockMvc.perform(get("/api/outpatient/reception/page").with(rhnWorkContext())
                        .queryParam("query", suffix)
                        .queryParam("page", "0")
                        .queryParam("size", "10"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertTrue(containsRegistration(queryMatch.get("content"), registrationId));

        // 验证关键词不匹配时返回空页
        JsonNode queryMiss = json(mockMvc.perform(get("/api/outpatient/reception/page").with(rhnWorkContext())
                        .queryParam("query", "NOT_EXIST_QUERY_KEYWORD_" + suffix)
                        .queryParam("page", "0")
                        .queryParam("size", "10"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertFalse(containsRegistration(queryMiss.get("content"), registrationId));
        org.junit.jupiter.api.Assertions.assertEquals(0, queryMiss.get("totalElements").asLong());

        // 验证状态过滤
        JsonNode statusMatch = json(mockMvc.perform(get("/api/outpatient/reception/page").with(rhnWorkContext())
                        .queryParam("status", "WAITING")
                        .queryParam("query", suffix))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertTrue(containsRegistration(statusMatch.get("content"), registrationId));

        JsonNode statusMiss = json(mockMvc.perform(get("/api/outpatient/reception/page").with(rhnWorkContext())
                        .queryParam("status", "COMPLETED")
                        .queryParam("query", suffix))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertFalse(containsRegistration(statusMiss.get("content"), registrationId));
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
                update RHN_SYS_ROLE_PERM_ASSIGN
                   set DT_VALID_TO = %s
                 where ID_TNT = ?
                   and ID_ACC_PERM in (
                       select ID_ACC_PERM from RHN_SYS_ACC_PERM where ID_TNT = ? and CD_ACC_PERM = ?
                   )
                """.formatted(validTo), Long.valueOf(TENANT), Long.valueOf(TENANT), code);
    }
}
