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
class OutpatientPlanTemplateTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void personal_and_department_templates_are_structured_reusable_and_soft_disabled() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        String name = "高血压复诊-" + suffix;
        JsonNode created = json(mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "scopeType":"PERSONAL","name":"%s","description":"基层常见病复诊方案",
                                  "diagnoses":[
                                    {"code":"I10","display":"原发性高血压","type":"PRIMARY"},
                                    {"code":"R05","display":"咳嗽","type":"SECONDARY"}
                                  ],"medications":[],"services":[]
                                }
                                """.formatted(name)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.scopeType").value("PERSONAL"))
                .andExpect(jsonPath("$.diagnoses.length()").value(2))
                .andReturn().getResponse().getContentAsString());

        String templateId = created.get("id").asString();
        mockMvc.perform(get("/api/outpatient/plan-templates").with(rhnWorkContext()).param("keyword", suffix))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(Long.valueOf(templateId)))
                .andExpect(jsonPath("$[0].useCount").value(0));

        JsonNode used = json(mockMvc.perform(post("/api/outpatient/plan-templates/{id}/use", templateId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.useCount").value(1))
                .andReturn().getResponse().getContentAsString());
        assertEquals(2, jdbcTemplate.queryForObject(
                "select count(*) from RHN_META_OP_PLAN_DIAG where ID_OP_PLAN_TMPL=?",
                Integer.class, Long.valueOf(templateId)));

        mockMvc.perform(post("/api/outpatient/plan-templates/{id}/disable", templateId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":%d}".formatted(used.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("INACTIVE"));
        mockMvc.perform(get("/api/outpatient/plan-templates").with(rhnWorkContext()).param("keyword", suffix))
                .andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void empty_or_invalid_diagnosis_template_is_rejected() throws Exception {
        mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"scopeType\":\"DEPARTMENT\",\"name\":\"空方案\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("PLAN_TEMPLATE_EMPTY"));
        mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"scopeType":"DEPARTMENT","name":"双主要诊断",
                                 "diagnoses":[{"code":"I10","display":"高血压","type":"PRIMARY"},
                                                {"code":"E11","display":"糖尿病","type":"PRIMARY"}]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PLAN_TEMPLATE_PRIMARY_DIAGNOSIS_INVALID"));
        mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"scopeType":"DEPARTMENT","name":"无效诊断方案",
                                 "diagnoses":[{"code":"ZZ99","display":"无效诊断","type":"PRIMARY"}]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PLAN_TEMPLATE_DIAGNOSIS_INVALID"));
    }

    @Test
    void medication_and_service_snapshots_are_resolved_from_current_master_data() throws Exception {
        String name = "高血压用药与复查-" + UUID.randomUUID().toString().substring(0, 6);
        mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "scopeType":"DEPARTMENT","name":"%s",
                                  "medications":[{
                                    "medicationId":"362387869795203","catalogItemId":"362387869795113",
                                    "packageId":"362387869795403","doseValue":5,"doseUnit":"mg",
                                    "routeCode":"ORAL","frequencyCode":"QD","durationValue":14,
                                    "durationUnit":"天","quantity":1,"quantityUnit":"BOX",
                                    "substitutionAllowed":true,"selfProvided":false,
                                    "medicationInstruction":"每日一次","priceType":"SALE","pricingRequired":true
                                  }],
                                  "services":[{
                                    "catalogItemId":"362387869795101","quantity":1,"unitCode":"次",
                                    "priceType":"SALE","pricingRequired":true,"reason":"复查血常规"
                                  }]
                                }
                                """.formatted(name)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.medications[0].medicationCode").value("DRUG-AML"))
                .andExpect(jsonPath("$.medications[0].productName").value("苯磺酸氨氯地平片 5mg"))
                .andExpect(jsonPath("$.medications[0].categoryCode").value("WESTERN"))
                .andExpect(jsonPath("$.services[0].itemCode").value("SRV-CBC"))
                .andExpect(jsonPath("$.services[0].serviceType").value("LABORATORY"));
    }
}
