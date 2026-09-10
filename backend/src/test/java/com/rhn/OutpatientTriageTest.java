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
    void shouldRecommendDepartmentsBasedOnVitalsAndChiefComplaint() throws Exception {
        mockMvc.perform(get("/api/outpatient/triage/recommend-departments")
                        .with(rhnWorkContext())
                        .param("chiefComplaint", "发热、咳嗽、咳黄痰3天")
                        .param("temperature", "38.8"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].departmentName").value("发热门诊"))
                .andExpect(jsonPath("$[0].score").isNumber())
                .andExpect(jsonPath("$[0].rationale").isNotEmpty());

        mockMvc.perform(get("/api/outpatient/triage/recommend-departments")
                        .with(rhnWorkContext())
                        .param("chiefComplaint", "突发胸部绞痛伴呼吸急促")
                        .param("systolic", "190")
                        .param("diastolic", "115"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].departmentName").value("心血管内科"))
                .andExpect(jsonPath("$[0].alertNotice").value(containsString("高血压危象")));
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
