package com.rhn;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("outpatient-main-flow")
class OutpatientOrderCancellationFulfillmentTest extends RhnIntegrationTestSupport {
    private static final String LABORATORY_ITEM = "362387869795101";

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void laboratory_request_cannot_be_cancelled_after_collection_but_can_before_it() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String encounterId = activeEncounter(suffix);
        JsonNode request = laboratoryRequest(encounterId);
        long requestId = request.get("id").asLong();

        // Unpaid and paid state does not matter; only what the laboratory has started does.
        mockMvc.perform(get("/api/encounters/{id}/service-requests", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].cancelBlockedReason").isEmpty());

        jdbc.update("""
                update RHN_EX_DIAG_EXEC_TASK set SD_STATUS = 'COLLECTED', DT_COLLD = current_timestamp,
                       ID_USER_COLLD = (select min(ID_USER) from RHN_SYS_USER_ACCT where ID_TNT = ?),
                       CD_SPEC_NO = 'SP-CANCEL-TEST' where ID_CARE_REQ = ?
                """, Long.valueOf(TENANT), requestId);
        mockMvc.perform(get("/api/encounters/{id}/service-requests", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].cancelBlockedReason").value("检验检查申请已采集、执行或出具报告，不能撤销"));
        cancel(encounterId, request).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SERVICE_REQUEST_CANCEL_BLOCKED"));
        assertEquals("ACTIVE", jdbc.queryForObject("select SD_STATUS from RHN_EX_CARE_REQ where ID_CARE_REQ = ?",
                String.class, requestId));

        jdbc.update("""
                update RHN_EX_DIAG_EXEC_TASK set SD_STATUS = 'READY', DT_COLLD = null, ID_USER_COLLD = null,
                       CD_SPEC_NO = null where ID_CARE_REQ = ?
                """, requestId);
        cancel(encounterId, request).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        assertEquals("CANCELLED", jdbc.queryForObject("select SD_STATUS from RHN_EX_DIAG_EXEC_TASK where ID_CARE_REQ = ?",
                String.class, requestId));
    }

    private org.springframework.test.web.servlet.ResultActions cancel(String encounterId, JsonNode request) throws Exception {
        return mockMvc.perform(post("/api/encounters/{encounterId}/service-requests/{requestId}/cancel",
                        encounterId, request.get("id").asString()).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"expectedRevision":%d,"reason":"医生更正医嘱"}
                        """.formatted(request.get("revision").asLong())));
    }

    private JsonNode laboratoryRequest(String encounterId) throws Exception {
        return json(mockMvc.perform(post("/api/encounters/{id}/service-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","quantity":1,"priceType":"SALE","performerDepartmentId":"%s",
                                 "businessDate":"2026-08-27","reason":"撤销校验","clinicalDescription":"门诊检验申请"}
                                """.formatted(LABORATORY_ITEM, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private String activeEncounter(String suffix) throws Exception {
        String digits = "%04d".formatted(Math.floorMod(suffix.hashCode(), 10000));
        String residentId = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"撤销校验患者%s","identifiers":[{"system":"9","value":"33010219920808%s","useType":"SECONDARY"}],
                                 "gender":"2","birthDate":"1992-08-08"}
                                """.formatted(suffix, digits)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        String encounterId = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        mockMvc.perform(verifiedEncounterStart(encounterId)).andExpect(status().isOk());
        return encounterId;
    }
}
