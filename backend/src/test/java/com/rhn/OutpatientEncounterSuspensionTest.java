package com.rhn;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("outpatient-main-flow")
class OutpatientEncounterSuspensionTest extends RhnIntegrationTestSupport {
    @Autowired
    JdbcTemplate jdbc;

    @Test
    void suspension_releases_the_work_session_and_resume_returns_the_patient_to_consultation() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String digits = "%04d".formatted(Math.floorMod(suffix.hashCode(), 10000));
        String residentId = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"门诊暂挂患者%s","identifiers":[{"system":"9","value":"33010219880808%s","useType":"SECONDARY"}],
                                  "gender":"2","birthDate":"1988-08-08","phone":"13800138000"
                                }
                                """.formatted(suffix, digits)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        String encounterId = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "idempotencyCode":"SUSPEND-REG-%s"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();

        mockMvc.perform(verifiedEncounterStart(encounterId))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"));
        mockMvc.perform(post("/api/encounters/{id}/suspend", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"commandCode":"SUSPEND-%s","reason":"患者暂时离开诊室：去取检查资料"}
                                """.formatted(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUSPENDED"));

        mockMvc.perform(get("/api/outpatient/reception/queue").with(rhnWorkContext())
                        .queryParam("date", LocalDate.now().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].status".formatted(encounterId))
                        .value("SUSPENDED"));
        mockMvc.perform(get("/api/outpatient-flow").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.visits[?(@.encounterId == '%s')].flowStatus".formatted(encounterId))
                        .value("CONSULTATION_SUSPENDED"))
                .andExpect(jsonPath("$.visits[?(@.encounterId == '%s')].attentionReason".formatted(encounterId))
                        .value("接诊已暂挂，需恢复后继续"))
                .andExpect(jsonPath("$.visits[?(@.encounterId == '%s')].nextActionText".formatted(encounterId))
                        .value("恢复接诊"));

        mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(clinicalRecord()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ENCOUNTER_STATE_INVALID"));
        mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "idempotencyCode":"SUSPEND-DUP-%s"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ENCOUNTER_ACTIVE_DUPLICATE"));

        mockMvc.perform(post("/api/encounters/{id}/resume", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"commandCode":"RESUME-%s","terminalCode":"TEST-DOCTOR"}
                                """.formatted(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"));
        mockMvc.perform(get("/api/outpatient/reception/queue").with(rhnWorkContext())
                        .queryParam("date", LocalDate.now().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].status".formatted(encounterId))
                        .value("SERVING"));
        mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(clinicalRecord()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.chiefComplaint").value("复诊头晕"));

        assertEquals(1, jdbc.queryForObject("""
                select count(*) from RHN_VIS_ENC_WORK_SESSION
                where ID_ENC = ? and SD_STATUS = 'CLOSED' and DES_CLOSE_REASON = 'SUSPENDED'
                """, Integer.class, Long.valueOf(encounterId)));
        assertEquals(1, jdbc.queryForObject("""
                select count(*) from RHN_VIS_ENC_WORK_SESSION
                where ID_ENC = ? and SD_STATUS = 'ACTIVE'
                """, Integer.class, Long.valueOf(encounterId)));
        assertEquals(2, jdbc.queryForObject("""
                select count(*) from RHN_VIS_ENC_STATUS_EVT
                where ID_ENC = ? and SD_STATUS_TO in ('SUSPENDED', 'IN_PROGRESS')
                  and CD_COMMAND in (?, ?)
                """, Integer.class, Long.valueOf(encounterId), "SUSPEND-" + suffix, "RESUME-" + suffix));
    }

    @Test
    void locate_flags_another_doctors_encounter_and_takeover_requires_a_reason_and_leaves_an_audit_trail() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String digits = "%04d".formatted(Math.floorMod(suffix.hashCode(), 10000));
        String residentId = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"门诊接管患者%s","identifiers":[{"system":"9","value":"33010219890909%s","useType":"SECONDARY"}],
                                  "gender":"1","birthDate":"1989-09-09","phone":"13800138001"
                                }
                                """.formatted(suffix, digits)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        String encounterId = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "idempotencyCode":"TAKEOVER-REG-%s"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();

        // 尚未接诊：可直接进入
        mockMvc.perform(get("/api/outpatient/reception/locate").with(rhnWorkContext()).queryParam("residentId", residentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.matches[0].action").value("ENTER"))
                .andExpect(jsonPath("$.matches[0].ownership").value("UNASSIGNED"));

        mockMvc.perform(verifiedEncounterStart(encounterId)).andExpect(status().isOk());
        mockMvc.perform(get("/api/outpatient/reception/locate").with(rhnWorkContext()).queryParam("residentId", residentId))
                .andExpect(jsonPath("$.matches[0].action").value("ENTER"))
                .andExpect(jsonPath("$.matches[0].ownership").value("MINE"));

        // 改为他人接诊后，必须确认接管
        jdbc.update("update RHN_VIS_ENC set ID_CLNCN = 'another-doctor' where ID_ENC = ?", Long.valueOf(encounterId));
        mockMvc.perform(get("/api/outpatient/reception/locate").with(rhnWorkContext()).queryParam("residentId", residentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.takeoverEnabled").value(true))
                .andExpect(jsonPath("$.matches[0].action").value("CONFIRM_TAKEOVER"))
                .andExpect(jsonPath("$.matches[0].ownership").value("OTHER"));

        mockMvc.perform(post("/api/encounters/{id}/takeover", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"commandCode":"TAKEOVER-%s","reason":" "}
                                """.formatted(suffix)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/encounters/{id}/takeover", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"commandCode":"TAKEOVER-%s","reason":"原医生离岗","terminalCode":"TEST-DOCTOR"}
                                """.formatted(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"));

        mockMvc.perform(get("/api/outpatient/reception/locate").with(rhnWorkContext()).queryParam("residentId", residentId))
                .andExpect(jsonPath("$.matches[0].action").value("ENTER"))
                .andExpect(jsonPath("$.matches[0].ownership").value("MINE"));
        assertEquals(1, jdbc.queryForObject("""
                select count(*) from RHN_VIS_ENC_WORK_SESSION
                where ID_ENC = ? and SD_STATUS = 'CLOSED' and DES_CLOSE_REASON = 'TAKEN_OVER'
                """, Integer.class, Long.valueOf(encounterId)));
        assertEquals(1, jdbc.queryForObject("""
                select count(*) from RHN_VIS_ENC_STATUS_EVT
                where ID_ENC = ? and CD_COMMAND = ? and DES_REASON like '%%原医生离岗%%'
                """, Integer.class, Long.valueOf(encounterId), "TAKEOVER-" + suffix));
    }

    private String clinicalRecord() {
        return """
                {
                  "chiefComplaint":"复诊头晕","presentIllness":"症状无明显加重",
                  "medicalHistory":"高血压病史","physicalExam":"神志清楚",
                  "treatmentPlan":"继续观察并规律服药","systolic":148,"diastolic":92,
                  "diagnoses":[{"code":"I10","display":"原发性高血压","type":"PRIMARY"}]
                }
                """;
    }
}
