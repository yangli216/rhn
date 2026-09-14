package com.rhn;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
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
class OutpatientReferralWorkflowTest extends RhnIntegrationTestSupport {
    private static final String TARGET_DEPARTMENT = "362387869899001";
    private static final String PHARMACY_DEPARTMENT = "362387869799103";
    @Autowired JdbcTemplate jdbc;

    @Test
    void consultation_blocks_source_completion_until_target_department_records_an_opinion() throws Exception {
        String suffix = suffix();
        String encounterId = preparedEncounter(suffix, "会诊连续性患者");
        JsonNode request = json(mockMvc.perform(post("/api/outpatient/referrals/encounters/{id}", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"referralType":"INTERNAL_CONSULT","targetOrganizationId":"%s",
                                 "targetDepartmentId":"%s","urgency":"ROUTINE",
                                 "referralReason":"反复胸闷，需要内科协助评估",
                                 "clinicalSummary":"生命体征平稳，已完成基础病历与主要诊断",
                                 "commandCode":"CONSULT-CREATE-%s"}
                                """.formatted(ORGANIZATION, TARGET_DEPARTMENT, suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("REQUESTED"))
                .andExpect(jsonPath("$.targetDepartmentName").value("内科门诊"))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(get("/api/outpatient-flow").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.visits[?(@.encounterId == '%s')].flowStatus".formatted(encounterId))
                        .value("WAITING_COORDINATION"))
                .andExpect(jsonPath("$.visits[?(@.encounterId == '%s')].nextDestination".formatted(encounterId))
                        .value("内科门诊"))
                .andExpect(jsonPath("$.visits[?(@.encounterId == '%s')].stages[?(@.stageCode == 'COORDINATION')].status"
                                .formatted(encounterId)).value("WAITING"));
        mockMvc.perform(post("/api/encounters/{id}/complete", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"CONSULT-BLOCK-%s\",\"dispositionCode\":\"HOME\"}"
                                .formatted(suffix)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ENCOUNTER_CONSULTATION_PENDING"));

        String requestId = request.get("id").asString();
        mockMvc.perform(get("/api/outpatient/referrals/inbox").with(targetWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '%s')].residentName".formatted(requestId))
                        .value("会诊连续性患者"));
        mockMvc.perform(post("/api/outpatient/referrals/{id}/accept", requestId).with(targetWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"CONSULT-ACCEPT-%s\"}".formatted(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACCEPTED"));
        mockMvc.perform(post("/api/outpatient/referrals/{id}/complete", requestId).with(targetWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"commandCode":"CONSULT-COMPLETE-%s",
                                 "opinion":"目前无急性心肺危险征象，建议完善心电图并门诊随访。"}
                                """.formatted(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.outcomeText").value("目前无急性心肺危险征象，建议完善心电图并门诊随访。"));

        mockMvc.perform(post("/api/encounters/{id}/complete", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"CONSULT-FINISH-%s\",\"dispositionCode\":\"HOME\"}"
                                .formatted(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));
        mockMvc.perform(get("/api/outpatient-flow").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.visits[?(@.encounterId == '%s')].flowStatus".formatted(encounterId))
                        .value("COMPLETED"))
                .andExpect(jsonPath("$.visits[?(@.encounterId == '%s')].stages[?(@.stageCode == 'COORDINATION')].status"
                                .formatted(encounterId)).value("COMPLETED"));
    }

    @Test
    void accepted_department_transfer_closes_source_and_creates_one_target_queue_encounter() throws Exception {
        String suffix = suffix();
        String sourceEncounterId = preparedEncounter(suffix, "院内转科连续性患者");
        JsonNode request = json(mockMvc.perform(post("/api/outpatient/referrals/encounters/{id}", sourceEncounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"referralType":"DEPARTMENT_TRANSFER","targetOrganizationId":"%s",
                                 "targetDepartmentId":"%s","urgency":"URGENT",
                                 "referralReason":"症状需要内科继续诊治",
                                 "clinicalSummary":"已完成身份核验、病历、主要诊断及签署，现申请院内转科",
                                 "commandCode":"TRANSFER-CREATE-%s"}
                                """.formatted(ORGANIZATION, TARGET_DEPARTMENT, suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("REQUESTED"))
                .andExpect(jsonPath("$.sourceEncounterStatus").value("SUSPENDED"))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(get("/api/outpatient-flow").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.visits[?(@.encounterId == '%s')].flowStatus".formatted(sourceEncounterId))
                        .value("WAITING_TRANSFER"))
                .andExpect(jsonPath("$.visits[?(@.encounterId == '%s')].nextDestination".formatted(sourceEncounterId))
                        .value("内科门诊"));

        String requestId = request.get("id").asString();
        String acceptCommand = "TRANSFER-ACCEPT-" + suffix;
        JsonNode accepted = json(mockMvc.perform(post("/api/outpatient/referrals/{id}/accept", requestId)
                        .with(targetWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"%s\"}".formatted(acceptCommand)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.targetEncounterId").isNotEmpty())
                .andExpect(jsonPath("$.targetRegistrationId").isNotEmpty())
                .andReturn().getResponse().getContentAsString());
        String targetEncounterId = accepted.get("targetEncounterId").asString();

        mockMvc.perform(post("/api/outpatient/referrals/{id}/accept", requestId)
                        .with(targetWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"commandCode\":\"%s\"}".formatted(acceptCommand)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.targetEncounterId").value(targetEncounterId));
        mockMvc.perform(get("/api/encounters/{id}", sourceEncounterId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("TRANSFERRED"));
        mockMvc.perform(get("/api/outpatient-flow").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.visits[?(@.encounterId == '%s')].flowStatus".formatted(sourceEncounterId))
                        .value("TRANSFERRED"))
                .andExpect(jsonPath("$.visits[?(@.encounterId == '%s')].nextDestination".formatted(sourceEncounterId))
                        .value("已转至内科门诊"));
        mockMvc.perform(get("/api/outpatient/reception/queue").with(targetWorkContext())
                        .queryParam("date", LocalDate.now().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].status".formatted(targetEncounterId))
                        .value("WAITING"));
        mockMvc.perform(post("/api/encounters/{id}/start", targetEncounterId).with(targetWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"factorResults\":{\"NAME\":true,\"TEST_IDENTIFIER\":true},\"terminalCode\":\"TARGET\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"));

        assertEquals(1, jdbcCount("select count(*) from RHN_VIS_ENC where ID_ENC = ?", Long.valueOf(targetEncounterId)));
        assertEquals(1, jdbcCount("select count(*) from RHN_EX_OP_REFER_EVT where ID_OP_REFER_REQ = ? and SD_STATUS_TO = 'COMPLETED'",
                Long.valueOf(requestId)));
    }

    @Test
    void department_transfer_rejects_non_clinical_target_department() throws Exception {
        String suffix = suffix();
        String sourceEncounterId = preparedEncounter(suffix, "转科目标约束患者");

        mockMvc.perform(post("/api/outpatient/referrals/encounters/{id}", sourceEncounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"referralType":"DEPARTMENT_TRANSFER","targetOrganizationId":"%s",
                                 "targetDepartmentId":"%s","urgency":"ROUTINE",
                                 "referralReason":"尝试转入非临床科室",
                                 "clinicalSummary":"已完成基础诊疗记录",
                                 "commandCode":"TRANSFER-NON-CLINICAL-%s"}
                                """.formatted(ORGANIZATION, PHARMACY_DEPARTMENT, suffix)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TRANSFER_TARGET_NOT_CLINICAL"));
        mockMvc.perform(get("/api/encounters/{id}", sourceEncounterId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"));
    }

    private String preparedEncounter(String suffix, String residentName) throws Exception {
        String digits = "%04d".formatted(Math.floorMod(suffix.hashCode(), 10000));
        String residentId = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"%s","identifiers":[{"system":"9","value":"33010219950505%s","useType":"SECONDARY"}],
                                 "gender":"FEMALE","birthDate":"1995-05-05"}
                                """.formatted(residentName, digits)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        String encounterId = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s",
                                 "idempotencyCode":"REF-REG-%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        mockMvc.perform(verifiedEncounterStart(encounterId)).andExpect(status().isOk());
        mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"chiefComplaint":"反复胸闷两天","presentIllness":"活动后偶发，无晕厥",
                                 "medicalHistory":"无特殊","physicalExam":"心肺查体未见明显异常",
                                 "treatmentPlan":"申请内科协同评估","systolic":126,"diastolic":80,
                                 "diagnoses":[{"code":"R07.4","display":"胸痛","type":"PRIMARY"}]}
                                """))
                .andExpect(status().isOk());
        JsonNode documents = json(mockMvc.perform(get("/api/clinical-documents").with(rhnWorkContext())
                        .queryParam("encounterId", encounterId))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/clinical-documents/{id}/sign", documents.get(0).get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedCurrentVersion\":1,\"signatureMeaning\":\"AUTHOR\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SIGNED"));
        return encounterId;
    }

    private int jdbcCount(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private RequestPostProcessor targetWorkContext() {
        return request -> {
            rhn().postProcessRequest(request);
            ((MockHttpServletRequest) request).addHeader("X-Organization-Id", ORGANIZATION);
            ((MockHttpServletRequest) request).addHeader("X-Department-Id", TARGET_DEPARTMENT);
            return request;
        };
    }

    private String suffix() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
    }
}
