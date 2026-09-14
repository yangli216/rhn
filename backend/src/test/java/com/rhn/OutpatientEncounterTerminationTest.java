package com.rhn;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("outpatient-main-flow")
class OutpatientEncounterTerminationTest extends RhnIntegrationTestSupport {
    private static final String TREATMENT_SERVICE_ID = "362387869795105";

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void termination_is_blocked_by_pending_business_and_closes_the_consultation_after_order_disposal() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String digits = "%04d".formatted(Math.floorMod(suffix.hashCode(), 10000));
        String residentId = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"门诊终止患者%s","identifiers":[{"system":"9","value":"33010219911212%s","useType":"SECONDARY"}],
                                 "gender":"MALE","birthDate":"1991-12-12"}
                                """.formatted(suffix, digits)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        String encounterId = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s",
                                 "idempotencyCode":"TERMINATE-REG-%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        mockMvc.perform(verifiedEncounterStart(encounterId))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"));

        JsonNode request = json(mockMvc.perform(post("/api/encounters/{id}/service-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","quantity":1,"priceType":"SALE","pricingRequired":true,
                                 "reason":"门诊处置","clinicalDescription":"终止诊疗阻断验证"}
                                """.formatted(TREATMENT_SERVICE_ID)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());

        mockMvc.perform(get("/api/outpatient-flow/{id}/termination-readiness", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.ready").value(false))
                .andExpect(jsonPath("$.issues[?(@.code == 'OUTSTANDING_AMOUNT')]").exists())
                .andExpect(jsonPath("$.issues[?(@.code == 'TREATMENT_PENDING')]").exists());
        mockMvc.perform(post("/api/outpatient-flow/{id}/terminate", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(terminationCommand(suffix)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ENCOUNTER_TERMINATION_BLOCKED"));

        mockMvc.perform(post("/api/encounters/{encounterId}/service-requests/{requestId}/cancel",
                                encounterId, request.get("id").asString()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"reason":"患者离院，项目未执行"}
                                """.formatted(request.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        mockMvc.perform(get("/api/outpatient-flow/{id}/termination-readiness", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.ready").value(true))
                .andExpect(jsonPath("$.issues").isEmpty());

        mockMvc.perform(post("/api/outpatient-flow/{id}/terminate", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(terminationCommand(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.clinicalStatus").value("TERMINATED"))
                .andExpect(jsonPath("$.terminationCode").value("PATIENT_LEFT"))
                .andExpect(jsonPath("$.terminationReason").value("患者自行离院，已完成风险告知"));
        mockMvc.perform(post("/api/outpatient-flow/{id}/terminate", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(terminationCommand(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.clinicalStatus").value("TERMINATED"));

        mockMvc.perform(get("/api/encounters/{id}", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("TERMINATED"))
                .andExpect(jsonPath("$.terminatedAt").isNotEmpty());
        mockMvc.perform(get("/api/outpatient/reception/queue").with(rhnWorkContext())
                        .queryParam("date", LocalDate.now().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].status".formatted(encounterId))
                        .value("COMPLETED"));
        mockMvc.perform(get("/api/outpatient-flow").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.visits[?(@.encounterId == '%s')].flowStatus".formatted(encounterId))
                        .value("TERMINATED"))
                .andExpect(jsonPath("$.visits[?(@.encounterId == '%s')].attentionReason".formatted(encounterId))
                        .value("诊疗已终止：患者自行离院，已完成风险告知"))
                .andExpect(jsonPath("$.visits[?(@.encounterId == '%s')].pendingMinutes".formatted(encounterId))
                        .value(0));
        mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"chiefComplaint":"不得继续写入","systolic":120,"diastolic":80,
                                 "diagnoses":[{"code":"Z00","display":"一般检查","type":"PRIMARY"}]}
                                """))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ENCOUNTER_STATE_INVALID"));

        assertEquals(1, jdbc.queryForObject("""
                select count(*) from RHN_VIS_ENC_WORK_SESSION
                where ID_ENC = ? and SD_STATUS = 'CLOSED' and DES_CLOSE_REASON = 'TERMINATED'
                """, Integer.class, Long.valueOf(encounterId)));
        assertEquals(1, jdbc.queryForObject("""
                select count(*) from RHN_VIS_ENC_STATUS_EVT
                where ID_ENC = ? and SD_STATUS_TO = 'TERMINATED'
                """, Integer.class, Long.valueOf(encounterId)));
    }

    private String terminationCommand(String suffix) {
        return """
                {"commandCode":"TERMINATE-%s","terminationCode":"PATIENT_LEFT",
                 "reason":"患者自行离院，已完成风险告知"}
                """.formatted(suffix);
    }
}
