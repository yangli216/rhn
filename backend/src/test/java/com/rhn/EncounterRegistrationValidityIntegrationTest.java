package com.rhn;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("outpatient-main-flow")
class EncounterRegistrationValidityIntegrationTest extends RhnIntegrationTestSupport {

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    @DisplayName("效期内阻断重复挂号；过期后即使就诊未结束，也解除挂号阻断且从医生站队列排除过期记录")
    void registrationValidityAndCutoffBehavior() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String digits = "%04d".formatted(Math.floorMod(suffix.hashCode(), 10000));

        // 1. 创建测试居民
        String residentId = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"效期测试患者%s","identifiers":[{"system":"9","value":"33010219900101%s","useType":"SECONDARY"}],
                                  "gender":"MALE","birthDate":"1990-01-01","phone":"13900139000"
                                }
                                """.formatted(suffix, digits)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();

        // 2. 发起首次挂号（处于当日效期内）
        String firstEncounterId = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "idempotencyCode":"VAL-REG-1-%s"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();

        // 3. 效期内再次挂号，验证被阻断并抛出 ENCOUNTER_ACTIVE_DUPLICATE
        mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "idempotencyCode":"VAL-REG-DUP-%s"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ENCOUNTER_ACTIVE_DUPLICATE"));

        // 4. 验证医生站接诊队列：包含该首诊，且包含 validUntil 效期截止时间戳
        mockMvc.perform(get("/api/outpatient/reception/queue").with(rhnWorkContext())
                        .queryParam("date", LocalDate.now().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.encounterId == '%s')]".formatted(firstEncounterId)).exists())
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].validUntil".formatted(firstEncounterId)).isNotEmpty());

        // 5. 模拟时间推进：将首次挂号与就诊的创建时间调整为 2 天前（已超期），但就诊状态保持 REGISTERED（未结束）
        Instant pastTwoDays = Instant.now().minus(2, ChronoUnit.DAYS);
        Timestamp pastTimestamp = Timestamp.from(pastTwoDays);
        jdbc.update("update RHN_VIS_ENC set DT_REGISTERED = ? where ID_ENC = ?", pastTimestamp, Long.valueOf(firstEncounterId));
        jdbc.update("update RHN_SC_PAT_REG set DT_REGISTERED = ? where ID_ENC = ?", pastTimestamp, Long.valueOf(firstEncounterId));

        // 6. 核心业务验证：过了效期后，即便就诊记录没有结束，挂号时也不再限制！
        String secondEncounterId = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "idempotencyCode":"VAL-REG-2-%s"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();

        assertNotNull(secondEncounterId);

        // 7. 验证医生站队列：已超期的首次挂号不再展示，新挂号正常展示
        mockMvc.perform(get("/api/outpatient/reception/queue").with(rhnWorkContext())
                        .queryParam("date", LocalDate.now().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].encounterId", not(hasItem(firstEncounterId))))
                .andExpect(jsonPath("$[*].encounterId", hasItem(secondEncounterId)));
    }
}
