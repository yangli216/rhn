package com.rhn;

import com.rhn.outpatient.triage.TriageContracts.CreateTriageRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class OutpatientTriageTest extends RhnIntegrationTestSupport {

    @Test
    void shouldCreateAndRetrieveTriageRecord() throws Exception {
        CreateTriageRequest request = new CreateTriageRequest(
                362387869790210L,
                null,
                null,
                null,
                "张建国",
                "MALE",
                58,
                LocalDate.of(1968, 5, 20),
                "13800138000",
                "110101196805201234",
                null,
                "WHEELCHAIR",
                "FAMILY",
                "持续性胸骨后压榨性剧痛伴大汗2小时",
                "胸痛,胸闷,大汗,心悸",
                BigDecimal.valueOf(37.0),
                BigDecimal.valueOf(105),
                BigDecimal.valueOf(22),
                BigDecimal.valueOf(185),
                BigDecimal.valueOf(112),
                BigDecimal.valueOf(95.0),
                BigDecimal.valueOf(6.5),
                7,
                "ALERT",
                false,
                "无流行病学接触史",
                "高血压危象,疑似ACS",
                "LEVEL_1_CRITICAL",
                "突发急性胸痛伴血压危象(185/112mmHg)，高度怀疑急性心梗",
                362387869800002L,
                "心血管内科",
                null,
                null,
                "CHEST_PAIN",
                "RESCUE_ROOM",
                "已联系胸痛绿色通道护送入抢救室",
                "nurse-01",
                "王护士"
        );

        String responseContent = mockMvc.perform(post("/api/outpatient/triage")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.patientName").value("张建国"))
                .andExpect(jsonPath("$.triageLevel").value("LEVEL_1_CRITICAL"))
                .andExpect(jsonPath("$.greenChannel").value("CHEST_PAIN"))
                .andExpect(jsonPath("$.triageNo").isNotEmpty())
                .andExpect(jsonPath("$.temperature").value(37.0))
                .andExpect(jsonPath("$.systolic").value(185))
                .andExpect(jsonPath("$.diastolic").value(112))
                .andReturn().getResponse().getContentAsString();

        String id = com.jayway.jsonpath.JsonPath.read(responseContent, "$.id");

        mockMvc.perform(get("/api/outpatient/triage/" + id)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.patientName").value("张建国"))
                .andExpect(jsonPath("$.triageReason").value(containsString("急性心梗")));
    }

    @Test
    void shouldRecommendRealDepartmentsBasedOnVitalsAndChiefComplaint() throws Exception {
        mockMvc.perform(get("/api/outpatient/triage/recommend-departments")
                        .with(rhnWorkContext())
                        .param("chiefComplaint", "发热、咳嗽、咳黄痰3天")
                        .param("temperature", "38.8"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].departmentId").value("362387869899001"))
                .andExpect(jsonPath("$[0].departmentName").value("内科门诊"))
                .andExpect(jsonPath("$[0].score").isNumber())
                .andExpect(jsonPath("$[0].rationale").isNotEmpty())
                .andExpect(jsonPath("$[0].availableScheduleCount").value(0))
                .andExpect(jsonPath("$[0].scheduledToday").value(false));

        mockMvc.perform(get("/api/outpatient/triage/recommend-departments")
                        .with(rhnWorkContext())
                        .param("chiefComplaint", "突发胸部绞痛伴呼吸急促")
                        .param("systolic", "190")
                        .param("diastolic", "115"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].departmentName").value("内科门诊"))
                .andExpect(jsonPath("$[0].source").value("LOCAL_ASSIST"));
    }

    @Test
    void shouldAssessWithLocalModeWithoutRequiringModel() throws Exception {
        mockMvc.perform(post("/api/outpatient/triage/assessments")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "chiefComplaint":"发热咳嗽3天",
                                  "temperature":38.8,
                                  "pulseRate":102,
                                  "consciousness":"ALERT",
                                  "age":35,
                                  "gender":"MALE",
                                  "aiEnhancement":true
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aiMode").value("LOCAL_ASSIST"))
                .andExpect(jsonPath("$.aiApplied").value(false))
                .andExpect(jsonPath("$.source").value("LOCAL_ASSIST"))
                .andExpect(jsonPath("$.ruleLevel").value("LEVEL_3_ROUTINE_URGENT"))
                .andExpect(jsonPath("$.departmentRecommendations[0].departmentName").value("内科门诊"));
    }

    @Test
    void shouldRaiseSubmittedLevelToServerRuleBaseline() throws Exception {
        CreateTriageRequest request = new CreateTriageRequest(
                Long.valueOf(ORGANIZATION), null, null, null, "安全基线患者", "MALE", 45, null,
                null, null, null, "WALK_IN", "NONE", "头晕", "", BigDecimal.valueOf(36.8),
                BigDecimal.valueOf(80), BigDecimal.valueOf(18), BigDecimal.valueOf(190),
                BigDecimal.valueOf(115), BigDecimal.valueOf(98), null, 1, "ALERT", false, null, null,
                "LEVEL_4_NON_URGENT", "人工初判普通", null, null, null, null, "NONE",
                "WAITING_QUEUE", null, "nurse-01", "王护士");

        mockMvc.perform(post("/api/outpatient/triage")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.triageLevel").value("LEVEL_1_CRITICAL"))
                .andExpect(jsonPath("$.triageReason").value(containsString("系统安全规则已将分级提升")));
    }

    @Test
    void shouldQueryTriageStatistics() throws Exception {
        mockMvc.perform(get("/api/outpatient/triage/statistics")
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCount").isNumber())
                .andExpect(jsonPath("$.level1CriticalCount").isNumber())
                .andExpect(jsonPath("$.level2UrgentCount").isNumber());
    }
}
