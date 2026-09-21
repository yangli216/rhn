package com.rhn;

import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.util.stream.StreamSupport;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class EncounterQueryTest extends RhnIntegrationTestSupport {

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Test
    void page_accepts_either_registration_or_reception_permission_and_rejects_unrelated_users() throws Exception {
        try {
            setPermissionActive("OUTPATIENT_RECEPTION.ACCESS", false);
            mockMvc.perform(get("/api/encounters/page").with(rhnWorkContext()))
                    .andExpect(status().isOk());

            setPermissionActive("OUTPATIENT_RECEPTION.ACCESS", true);
            setPermissionActive("OUTPATIENT_REGISTRATION.ACCESS", false);
            mockMvc.perform(get("/api/encounters/page").with(rhnWorkContext()))
                    .andExpect(status().isOk());

            setPermissionActive("OUTPATIENT_RECEPTION.ACCESS", false);
            mockMvc.perform(get("/api/encounters/page").with(rhnWorkContext()))
                    .andExpect(status().isForbidden());
        } finally {
            setPermissionActive("OUTPATIENT_REGISTRATION.ACCESS", true);
            setPermissionActive("OUTPATIENT_RECEPTION.ACCESS", true);
        }
    }

    @Test
    void page_queries_encounters_with_pagination_status_and_keyword_filters() throws Exception {
        String suffix = Long.toString(GlobalIds.next()).substring(13);
        JsonNode resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"就诊查询测试%s","identifiers":[{"system":"9","value":"ENC-QUERY-%s","useType":"SECONDARY"}],
                                  "gender":"MALE","birthDate":"1988-08-18","phone":"13900139088"
                                }
                                """.formatted(suffix, suffix)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        String residentId = resident.get("id").asString();

        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "idempotencyCode":"ENC-PAGE-%s"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        String encounterId = encounter.get("id").asString();
        String encounterNo = encounter.get("encounterNo").asString();

        // 1. 基本分页查询
        JsonNode pageResp = json(mockMvc.perform(get("/api/encounters/page").with(rhnWorkContext())
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
        assertTrue(containsEncounter(pageResp.get("content"), encounterId));

        // 2. 关键词模糊查询匹配
        JsonNode queryMatch = json(mockMvc.perform(get("/api/encounters/page").with(rhnWorkContext())
                        .queryParam("query", suffix)
                        .queryParam("page", "0")
                        .queryParam("size", "10"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertTrue(containsEncounter(queryMatch.get("content"), encounterId));
        JsonNode matchedItem = findEncounter(queryMatch.get("content"), encounterId);
        assertEquals(encounterNo, matchedItem.get("encounterNo").asString());
        assertEquals("就诊查询测试" + suffix, matchedItem.get("residentName").asString());
        assertEquals("REGISTERED", matchedItem.get("status").asString());
        assertTrue(matchedItem.has("departmentName"));

        // 3. 关键词不匹配返回空
        JsonNode queryMiss = json(mockMvc.perform(get("/api/encounters/page").with(rhnWorkContext())
                        .queryParam("query", "NON_EXISTENT_ENC_" + suffix)
                        .queryParam("page", "0")
                        .queryParam("size", "10"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertEquals(0, queryMiss.get("totalElements").asLong());
        assertFalse(containsEncounter(queryMiss.get("content"), encounterId));

        // 4. 按状态过滤：当前为 REGISTERED
        JsonNode statusRegistered = json(mockMvc.perform(get("/api/encounters/page").with(rhnWorkContext())
                        .queryParam("status", "REGISTERED")
                        .queryParam("query", suffix))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertTrue(containsEncounter(statusRegistered.get("content"), encounterId));

        JsonNode statusCompleted = json(mockMvc.perform(get("/api/encounters/page").with(rhnWorkContext())
                        .queryParam("status", "COMPLETED")
                        .queryParam("query", suffix))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertFalse(containsEncounter(statusCompleted.get("content"), encounterId));

        // 5. 接诊并记录病历后，验证主诉和状态变更
        mockMvc.perform(post("/api/encounters/{id}/start", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "commandCode":"START-ENC-PAGE-%s",
                                  "factorResults":{"NAME":true,"PHONE":true}
                                }
                                """.formatted(suffix)))
                .andExpect(status().isOk());

        mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "commandCode":"REC-ENC-PAGE-%s",
                                  "chiefComplaint":"主诉咳嗽伴发热%s",
                                  "systolic":120,
                                  "diastolic":80,
                                  "diagnoses":[{"code":"J00","display":"急性上呼吸道感染","type":"PRIMARY"}]
                                }
                                """.formatted(suffix, suffix)))
                .andExpect(status().isOk());

        JsonNode inProgressQuery = json(mockMvc.perform(get("/api/encounters/page").with(rhnWorkContext())
                        .queryParam("status", "IN_PROGRESS")
                        .queryParam("query", suffix))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertTrue(containsEncounter(inProgressQuery.get("content"), encounterId));
        JsonNode inProgressItem = findEncounter(inProgressQuery.get("content"), encounterId);
        assertEquals("主诉咳嗽伴发热" + suffix, inProgressItem.get("chiefComplaint").asString());
        assertEquals("急性上呼吸道感染", inProgressItem.get("primaryDiagnosisName").asString());
        assertEquals("J00", inProgressItem.get("primaryDiagnosisCode").asString());
        assertEquals(1, inProgressItem.get("diagnosisCount").asInt());

        // 6. 验证全院 ORGANIZATION scope
        JsonNode orgQuery = json(mockMvc.perform(get("/api/encounters/page").with(rhnWorkContext())
                        .queryParam("scope", "ORGANIZATION")
                        .queryParam("query", suffix))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertTrue(containsEncounter(orgQuery.get("content"), encounterId));
    }

    private boolean containsEncounter(JsonNode content, String encounterId) {
        return StreamSupport.stream(content.spliterator(), false)
                .anyMatch(node -> encounterId.equals(node.path("id").asText()));
    }

    private JsonNode findEncounter(JsonNode content, String encounterId) {
        return StreamSupport.stream(content.spliterator(), false)
                .filter(node -> encounterId.equals(node.path("id").asText()))
                .findFirst()
                .orElse(null);
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
