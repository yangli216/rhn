package com.rhn;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("outpatient-main-flow")
class OutpatientCommandRetryTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void uncertain_client_retries_do_not_repeat_clinical_facts_or_state_transitions() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        String residentId = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"门诊重试患者","nationalId":"RETRY%s",
                                 "gender":"FEMALE","birthDate":"1991-05-06"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        String encounterId = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s",
                                 "idempotencyCode":"RETRY-REG-%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();

        String start = """
                {"commandCode":"RETRY-START-%s","terminalCode":"TEST-RETRY",
                 "factorResults":{"NAME":true,"BIRTH_DATE":true}}
                """.formatted(suffix);
        for (int attempt = 0; attempt < 2; attempt++) {
            mockMvc.perform(post("/api/encounters/{id}/start", encounterId).with(rhnWorkContext())
                            .contentType(MediaType.APPLICATION_JSON).content(start))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"));
        }
        assertEquals(1, count("encounter_identity_checks", encounterId));
        assertEquals(1, statusEventCount(encounterId, "IN_PROGRESS"));
        assertEquals(1, count("encounter_work_sessions", encounterId));

        String suspend = """
                {"commandCode":"RETRY-SUSPEND-%s","reason":"等待检查结果"}
                """.formatted(suffix);
        for (int attempt = 0; attempt < 2; attempt++) {
            mockMvc.perform(post("/api/encounters/{id}/suspend", encounterId).with(rhnWorkContext())
                            .contentType(MediaType.APPLICATION_JSON).content(suspend))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUSPENDED"));
        }
        String resume = """
                {"commandCode":"RETRY-RESUME-%s","terminalCode":"TEST-RETRY"}
                """.formatted(suffix);
        for (int attempt = 0; attempt < 2; attempt++) {
            mockMvc.perform(post("/api/encounters/{id}/resume", encounterId).with(rhnWorkContext())
                            .contentType(MediaType.APPLICATION_JSON).content(resume))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"));
        }
        assertEquals(1, statusEventCount(encounterId, "SUSPENDED"));
        assertEquals(2, statusEventCount(encounterId, "IN_PROGRESS"));
        assertEquals(2, count("encounter_work_sessions", encounterId));

        String record = """
                {"commandCode":"RETRY-RECORD-%s","chiefComplaint":"头晕三天",
                 "presentIllness":"晨起明显","medicalHistory":"既往高血压",
                 "physicalExam":"心肺未见异常","treatmentPlan":"监测血压",
                 "systolic":156,"diastolic":94,
                 "diagnoses":[{"code":"I10","display":"原发性高血压","type":"PRIMARY"}]}
                """.formatted(suffix);
        for (int attempt = 0; attempt < 2; attempt++) {
            mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounterId).with(rhnWorkContext())
                            .contentType(MediaType.APPLICATION_JSON).content(record))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.chiefComplaint").value("头晕三天"));
        }
        mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(record.replace("头晕三天", "头晕四天")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
        assertEquals(1, jdbcTemplate.queryForObject("""
                select count(*) from clinical_document_versions v join clinical_documents d
                  on d.tenant_id=v.tenant_id and d.id=v.document_id where d.encounter_id=?
                """, Integer.class, Long.valueOf(encounterId)));
        assertEquals(2, count("observations", encounterId));
        assertEquals(1, count("encounter_diagnosis_revisions", encounterId));

        String documentId = json(mockMvc.perform(get("/api/clinical-documents").param("encounterId", encounterId)
                        .with(rhnWorkContext())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString()).get(0).get("id").asText();
        mockMvc.perform(post("/api/clinical-documents/{id}/sign", documentId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedCurrentVersion\":1,\"signatureMeaning\":\"AUTHOR\"}"))
                .andExpect(status().isOk());

        String complete = """
                {"commandCode":"RETRY-COMPLETE-%s","dispositionCode":"FOLLOW_UP",
                 "dispositionNote":"一周后复诊"}
                """.formatted(suffix);
        for (int attempt = 0; attempt < 2; attempt++) {
            mockMvc.perform(post("/api/encounters/{id}/complete", encounterId).with(rhnWorkContext())
                            .contentType(MediaType.APPLICATION_JSON).content(complete))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));
        }
        assertEquals(1, statusEventCount(encounterId, "COMPLETED"));
        assertEquals(1, jdbcTemplate.queryForObject(
                "select count(*) from encounter_completion_checks where encounter_id=? and result='PASS'",
                Integer.class, Long.valueOf(encounterId)));
        assertEquals(5, jdbcTemplate.queryForObject("""
                select count(*) from idempotency_records
                 where resource_id=? and operation_code like 'OUTPATIENT.ENCOUNTER.%' and status='COMPLETED'
                """, Integer.class, Long.valueOf(encounterId)));
    }

    private int count(String table, String encounterId) {
        return jdbcTemplate.queryForObject("select count(*) from " + table + " where encounter_id=?",
                Integer.class, Long.valueOf(encounterId));
    }

    private int statusEventCount(String encounterId, String statusTo) {
        return jdbcTemplate.queryForObject(
                "select count(*) from encounter_status_events where encounter_id=? and status_to=?",
                Integer.class, Long.valueOf(encounterId), statusTo);
    }
}
