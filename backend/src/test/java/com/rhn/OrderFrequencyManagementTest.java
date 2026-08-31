package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class OrderFrequencyManagementTest extends RhnIntegrationTestSupport {

    @Test
    void resolves_organization_schedule_and_previews_structured_frequency() throws Exception {
        mockMvc.perform(get("/api/platform/master-data/order-frequencies/active")
                        .param("organizationId", ORGANIZATION).param("departmentId", DEPARTMENT)
                        .param("scene", "OUTPATIENT").param("orderType", "MEDICATION").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code == 'BID')].name").value("每日两次"))
                .andExpect(jsonPath("$[?(@.code == 'BID')].executionTimes.length()").value(2))
                .andExpect(jsonPath("$[?(@.code == 'BID')].executionTimes[0]").value("08:00"));

        mockMvc.perform(post("/api/platform/master-data/order-frequencies/preview").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"code":"BID","organizationId":"%s","departmentId":"%s",
                         "start":"2026-08-30T10:00:00","occurrences":3}
                        """.formatted(ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ruleType").value("TIMES_PER_PERIOD"))
                .andExpect(jsonPath("$.plannedTimes.length()").value(3))
                .andExpect(jsonPath("$.plannedTimes[0]").value("2026-08-30T20:00:00"))
                .andExpect(jsonPath("$.plannedTimes[1]").value("2026-08-31T08:00:00"));
    }

    @Test
    void creates_frequency_and_department_override_with_validation() throws Exception {
        String code = "Q3H" + UUID.randomUUID().toString().substring(0, 4).toUpperCase();
        JsonNode created = json(mockMvc.perform(post("/api/platform/master-data/order-frequencies").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"code":"%s","name":"每三小时一次","shortName":"Q3H","description":"测试频次",
                         "ruleType":"FIXED_INTERVAL","frequencyCount":1,"periodValue":3,"periodUnit":"H",
                         "anchorType":"ORDER_START","outpatientApplicable":true,"inpatientApplicable":true,
                         "emergencyApplicable":true,"medicationApplicable":true,"treatmentApplicable":true,
                         "nursingApplicable":false,"automaticTaskGeneration":true,"sortOrder":200,
                         "status":"ACTIVE","validFrom":"2026-01-01"}
                        """.formatted(code)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value(code))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(post("/api/platform/master-data/order-frequencies/{id}/configurations",
                        created.get("id").asText()).with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"organizationId":"%s","departmentId":"%s","localName":"每三小时",
                         "firstDayPolicy":"FROM_ORDER_TIME","enabled":true,"status":"ACTIVE",
                         "validFrom":"2026-01-01"}
                        """.formatted(ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.configurations[0].departmentId").value(DEPARTMENT));

        mockMvc.perform(post("/api/platform/master-data/order-frequencies").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"code":"BADTIME","name":"错误时点","ruleType":"TIMES_PER_PERIOD",
                         "frequencyCount":2,"periodValue":1,"periodUnit":"D","anchorType":"STANDARD_TIME",
                         "defaultExecutionTimes":"08:00","outpatientApplicable":true,"inpatientApplicable":false,
                         "emergencyApplicable":false,"medicationApplicable":true,"treatmentApplicable":false,
                         "nursingApplicable":false,"automaticTaskGeneration":true,"sortOrder":999,
                         "status":"ACTIVE","validFrom":"2026-01-01"}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ORDER_FREQUENCY_EXECUTION_TIME_COUNT_INVALID"));
    }

    @Test
    void medication_default_frequency_is_a_validated_master_data_reference() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        mockMvc.perform(post("/api/platform/master-data/medications").param("organizationId", ORGANIZATION)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"code":"MED-FREQ-%s","name":"频次引用测试药品","sdMedicationType":"WESTERN",
                         "sdDoseForm":"TABLET","preparationSpec":"1g","preparationUnit":"片",
                         "prescriptionDrug":true,"essentialDrug":false,"antimicrobial":false,
                         "skinTestRequired":false,"defaultDose":1,"defaultDoseUnit":"片","defaultRoute":"PO",
                         "defaultFrequency":"BID","chronicDiseaseDrug":false,"singleOrder":true,"sdStatus":"ACTIVE"}
                        """.formatted(suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.defaultFrequency").value("BID"))
                .andExpect(jsonPath("$.defaultFrequencyId").isNotEmpty());

        mockMvc.perform(post("/api/platform/master-data/medications").param("organizationId", ORGANIZATION)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"code":"MED-BADFREQ-%s","name":"非法频次测试药品","sdMedicationType":"WESTERN",
                         "sdDoseForm":"TABLET","preparationSpec":"1g","preparationUnit":"片",
                         "prescriptionDrug":true,"essentialDrug":false,"antimicrobial":false,
                         "skinTestRequired":false,"defaultFrequency":"UNKNOWN_FREQ",
                         "chronicDiseaseDrug":false,"singleOrder":true,"sdStatus":"ACTIVE"}
                        """.formatted(suffix)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ORDER_FREQUENCY_INVALID"));
    }
}
