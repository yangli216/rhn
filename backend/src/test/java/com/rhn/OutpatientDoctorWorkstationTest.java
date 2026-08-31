package com.rhn;

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

class OutpatientDoctorWorkstationTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void verified_start_diagnosis_revision_and_completion_check_are_append_only() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String resident = mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"门诊重建患者","nationalId":"OPD%s",
                                 "gender":"FEMALE","birthDate":"1992-03-04"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String residentId = json(resident).get("id").asText();
        String encounter = mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s",
                                 "idempotencyCode":"OPD-REG-%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String encounterId = json(encounter).get("id").asText();

        mockMvc.perform(post("/api/encounters/{id}/start", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"commandCode":"OPD-START-FAIL-%s","factorResults":{"NAME":true}}
                                """.formatted(suffix)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ENCOUNTER_IDENTITY_FACTOR_INSUFFICIENT"));

        mockMvc.perform(post("/api/encounters/{id}/start", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"commandCode":"OPD-START-%s","terminalCode":"TEST-DOCTOR",
                                 "factorResults":{"NAME":true,"BIRTH_DATE":true}}
                                """.formatted(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"));

        saveRecord(encounterId, "反复头晕三天", "原发性高血压", false);
        saveRecord(encounterId, "反复头晕三天，晨起明显", "原发性高血压（确认）", true);

        assertEquals(1, count("encounter_identity_checks", encounterId));
        assertEquals(1, jdbcTemplate.queryForObject("select count(*) from encounter_work_sessions where encounter_id=? and status='ACTIVE'", Integer.class, Long.valueOf(encounterId)));
        assertEquals(2, count("encounter_diagnoses", encounterId));
        assertEquals(2, jdbcTemplate.queryForObject("select count(*) from encounter_diagnoses where encounter_id=? and diagnosis_status='ACTIVE'", Integer.class, Long.valueOf(encounterId)));
        assertEquals(3, count("encounter_diagnosis_revisions", encounterId));
        assertEquals(2, jdbcTemplate.queryForObject("select business_version_no from encounter_diagnoses where encounter_id=? and code='I10'", Integer.class, Long.valueOf(encounterId)));

        mockMvc.perform(post("/api/encounters/{id}/complete", encounterId).with(rhnWorkContext()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DOCUMENT_SIGNATURE_REQUIRED"));
        assertEquals(1, jdbcTemplate.queryForObject("select count(*) from encounter_completion_checks where encounter_id=? and result='BLOCKED'", Integer.class, Long.valueOf(encounterId)));
        assertEquals(1, jdbcTemplate.queryForObject("select count(*) from encounter_completion_issues i join encounter_completion_checks c on c.tenant_id=i.tenant_id and c.id=i.completion_check_id where c.encounter_id=? and i.issue_code='OUTPATIENT_NOTE_UNSIGNED'", Integer.class, Long.valueOf(encounterId)));

        String documents = mockMvc.perform(get("/api/clinical-documents").param("encounterId", encounterId)
                        .with(rhnWorkContext())).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].content.presentIllness").value("晨起头晕明显，无意识障碍"))
                .andExpect(jsonPath("$[0].content.medicalHistory").value("既往血压偏高"))
                .andExpect(jsonPath("$[0].content.physicalExam").value("神志清，心肺查体未见明显异常"))
                .andExpect(jsonPath("$[0].content.treatmentPlan").value("完善评估并监测血压"))
                .andReturn().getResponse().getContentAsString();
        String documentId = json(documents).get(0).get("id").asText();
        mockMvc.perform(post("/api/clinical-documents/{id}/sign", documentId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedCurrentVersion\":2,\"signatureMeaning\":\"AUTHOR\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/encounters/{id}/complete", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dispositionCode\":\"FOLLOW_UP\",\"dispositionNote\":\"一周后复诊\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));

        assertEquals(1, jdbcTemplate.queryForObject("select count(*) from encounter_completion_checks where encounter_id=? and result='PASS'", Integer.class, Long.valueOf(encounterId)));
        assertEquals(1, jdbcTemplate.queryForObject("select count(*) from encounter_work_sessions where encounter_id=? and status='CLOSED' and close_reason='COMPLETED'", Integer.class, Long.valueOf(encounterId)));
        assertEquals("诊毕检查通过；转归=FOLLOW_UP；说明=一周后复诊", jdbcTemplate.queryForObject(
                "select reason from encounter_status_events where encounter_id=? and status_to='COMPLETED'",
                String.class, Long.valueOf(encounterId)));
        assertEquals(3, count("encounter_status_events", encounterId));
    }

    @Test
    void allergy_fact_is_visible_and_matching_medication_requires_review_and_override_reason() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String medicationCode = "MED-ALLERGY-" + suffix;
        String residentId = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"过敏核对患者","nationalId":"SAFE%s",
                                 "gender":"MALE","birthDate":"1988-06-08"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        String encounterId = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s",
                                 "idempotencyCode":"SAFE-REG-%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        mockMvc.perform(post("/api/encounters/{id}/start", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"commandCode":"SAFE-START-%s","factorResults":{"NAME":true,"BIRTH_DATE":true}}
                                """.formatted(suffix)))
                .andExpect(status().isOk());

        String allergy = mockMvc.perform(post("/api/residents/{id}/allergies", residentId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"encounterId":"%s","assertionType":"ALLERGY","categoryCode":"DRUG",
                                 "criticalityCode":"HIGH","reactionSeverity":"SEVERE","informationSource":"PATIENT",
                                 "substanceCode":"%s","substanceDisplay":"测试高风险药","reactionText":"呼吸困难"}
                                """.formatted(encounterId, medicationCode)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.clinicalStatus").value("ACTIVE"))
                .andReturn().getResponse().getContentAsString();
        String allergyId = json(allergy).get("id").asText();
        long allergyRevision = json(allergy).get("revision").asLong();
        mockMvc.perform(get("/api/residents/{id}/allergies", residentId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].substanceCode").value(medicationCode));

        String medicationId = json(mockMvc.perform(post("/api/platform/master-data/medications").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"%s","name":"测试高风险药","sdMedicationType":"WESTERN",
                                 "sdDoseForm":"TABLET","preparationSpec":"10mg","preparationUnit":"片",
                                 "prescriptionDrug":true,"essentialDrug":false,"antimicrobial":false,
                                 "skinTestRequired":false,"defaultDose":10,"defaultDoseUnit":"mg",
                                 "defaultRoute":"PO","defaultFrequency":"QD","chronicDiseaseDrug":false,
                                 "singleOrder":false,"sdStatus":"ACTIVE"}
                                """.formatted(medicationCode)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        String prescriptionId = json(mockMvc.perform(post("/api/encounters/{id}/prescriptions", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"categoryCode\":\"OUTPATIENT\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        String baseLine = """
                {"prescriptionId":"%s","medicationId":"%s","quantity":7,"quantityUnit":"片",
                 "substitutionAllowed":true,"selfProvided":false,"medicationInstruction":"每日一次"%s}
                """;
        mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(baseLine.formatted(prescriptionId, medicationId, "")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("MEDICATION_ALLERGY_REVIEW_REQUIRED"));
        mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(baseLine.formatted(
                                prescriptionId, medicationId, ",\"allergyReviewConfirmed\":true")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("MEDICATION_ALLERGY_MATCH"));
        String infusionRoot = mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(baseLine.formatted(prescriptionId, medicationId,
                                ",\"routeCode\":\"IVGTT\","
                                        + "\"allergyReviewConfirmed\":true,\"allergyOverrideReason\":\"已评估获益大于风险\"")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.parentRequestId").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        String infusionRootId = json(infusionRoot).get("id").asText();
        mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(baseLine.formatted(prescriptionId, medicationId,
                                ",\"routeCode\":\"IVGTT\",\"parentRequestId\":\"%s\","
                                        .formatted(infusionRootId)
                                        + "\"allergyReviewConfirmed\":true,\"allergyOverrideReason\":\"已评估获益大于风险\"")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.parentRequestId").value(infusionRootId));

        mockMvc.perform(post("/api/residents/{residentId}/allergies/{allergyId}/inactivate", residentId, allergyId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":%d,\"reason\":\"复核后排除\"}".formatted(allergyRevision)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.clinicalStatus").value("INACTIVE"));
        mockMvc.perform(get("/api/residents/{id}/allergies", residentId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
    }

    private void saveRecord(String encounterId, String complaint, String diagnosisDisplay, boolean withSecondary) throws Exception {
        String secondary = withSecondary
                ? ",{\"code\":\"R42\",\"display\":\"头晕\",\"type\":\"SECONDARY\"}" : "";
        mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"chiefComplaint":"%s","presentIllness":"晨起头晕明显，无意识障碍",
                                 "medicalHistory":"既往血压偏高","physicalExam":"神志清，心肺查体未见明显异常",
                                 "treatmentPlan":"完善评估并监测血压","systolic":148,"diastolic":92,
                                 "diagnoses":[{"code":"I10","display":"%s","type":"PRIMARY"}%s]}
                                """.formatted(complaint, diagnosisDisplay, secondary)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.diagnoses[0].code").value("I10"));
    }

    private int count(String table, String encounterId) {
        return jdbcTemplate.queryForObject("select count(*) from " + table + " where encounter_id=?",
                Integer.class, Long.valueOf(encounterId));
    }
}
