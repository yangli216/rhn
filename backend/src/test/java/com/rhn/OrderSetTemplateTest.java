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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 临床模板库 P1a：医嘱组套（ORDER_SET）的维护、校验与与诊疗方案的隔离。 */
@Tag("outpatient-main-flow")
class OrderSetTemplateTest extends RhnIntegrationTestSupport {
    static final String MEDICATION = """
            {"medicationId":"362387869795203","catalogItemId":"362387869795113","packageId":"362387869795403",
             "doseValue":5,"doseUnit":"mg","routeCode":"ORAL","frequencyCode":"QD","durationValue":14,
             "durationUnit":"天","quantity":1,"quantityUnit":"BOX","substitutionAllowed":true,"selfProvided":false,
             "medicationInstruction":"每日一次","priceType":"SALE","pricingRequired":true%s}""";
    static final String SERVICE = """
            {"catalogItemId":"362387869795101","quantity":1,"unitCode":"次","priceType":"SALE",
             "pricingRequired":true,"reason":"复查血常规"%s}""";
    // 开发样例中的医学检验科，属于当前机构且有效
    static final String LAB_DEPARTMENT = "362387869899101";

    @Autowired JdbcTemplate jdbc;

    private JsonNode createOrderSet(String name, String medicationExtra, String serviceExtra) throws Exception {
        return json(mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"templateKind":"ORDER_SET","scopeType":"PERSONAL","name":"%s",
                                 "medications":[%s],"services":[%s]}
                                """.formatted(name, MEDICATION.formatted(medicationExtra), SERVICE.formatted(serviceExtra))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    @Test
    void order_set_is_created_read_back_with_default_selection_and_execution_department() throws Exception {
        String name = "感冒常用组套-" + UUID.randomUUID().toString().substring(0, 6);
        JsonNode created = createOrderSet(name, ",\"defaultSelected\":false",
                ",\"executionDepartmentId\":\"" + LAB_DEPARTMENT + "\"");
        long id = created.get("id").asLong();
        assertEquals("ORDER_SET", created.get("templateKind").asString());
        assertEquals(false, created.get("medications").get(0).get("defaultSelected").asBoolean());
        assertEquals(true, created.get("services").get(0).get("defaultSelected").asBoolean());
        assertEquals(Long.parseLong(LAB_DEPARTMENT), created.get("services").get(0).get("executionDepartmentId").asLong());
        assertEquals("ORDER_SET", jdbc.queryForObject(
                "select SD_TMPL_KIND from RHN_META_OP_PLAN_TMPL where ID_OP_PLAN_TMPL=?", String.class, id));
        assertEquals(Long.parseLong(LAB_DEPARTMENT), jdbc.queryForObject(
                "select ID_DEPT_EXEC from RHN_META_OP_PLAN_SVC where ID_OP_PLAN_TMPL=?", Long.class, id));

        mockMvc.perform(get("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .param("kind", "ORDER_SET").param("keyword", name))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].templateKind").value("ORDER_SET"))
                .andExpect(jsonPath("$[0].medications[0].defaultSelected").value(false))
                .andExpect(jsonPath("$[0].services[0].executionDepartmentId").value(Long.parseLong(LAB_DEPARTMENT)))
                .andExpect(jsonPath("$[0].searchProfile").doesNotExist());
    }

    @Test
    void kind_filter_defaults_to_protocol_and_never_leaks_order_sets() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6);
        createOrderSet("过滤组套-" + suffix, "", "");
        mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"scopeType":"PERSONAL","name":"过滤方案-%s",
                                 "diagnoses":[{"code":"I10","display":"原发性高血压","type":"PRIMARY"}]}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.templateKind").value("PROTOCOL"));

        mockMvc.perform(get("/api/outpatient/plan-templates").with(rhnWorkContext()).param("keyword", suffix))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].templateKind").value("PROTOCOL"));
        mockMvc.perform(get("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .param("keyword", suffix).param("kind", "PROTOCOL"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(get("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .param("keyword", suffix).param("kind", "ORDER_SET"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].templateKind").value("ORDER_SET"));
        mockMvc.perform(get("/api/outpatient/plan-templates").with(rhnWorkContext()).param("kind", "NOTE"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CLINICAL_TEMPLATE_KIND_INVALID"));
    }

    @Test
    void order_set_can_be_updated_and_disabled_but_kind_cannot_change() throws Exception {
        String name = "更新组套-" + UUID.randomUUID().toString().substring(0, 6);
        JsonNode created = createOrderSet(name, "", "");
        String id = created.get("id").asString();
        long revision = created.get("revision").asLong();
        String body = """
                {"expectedRevision":%d,"templateKind":"%s","scopeType":"PERSONAL","name":"%s-已改名",
                 "medications":[],"services":[%s]}
                """;

        mockMvc.perform(put("/api/outpatient/plan-templates/{id}", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.formatted(revision, "PROTOCOL", name, SERVICE.formatted(""))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CLINICAL_TEMPLATE_KIND_INVALID"));

        JsonNode updated = json(mockMvc.perform(put("/api/outpatient/plan-templates/{id}", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.formatted(revision, "ORDER_SET", name,
                                SERVICE.formatted(",\"defaultSelected\":false"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.templateKind").value("ORDER_SET"))
                .andExpect(jsonPath("$.name").value(name + "-已改名"))
                .andExpect(jsonPath("$.medications.length()").value(0))
                .andExpect(jsonPath("$.services[0].defaultSelected").value(false))
                .andReturn().getResponse().getContentAsString());

        // 客户端省略 templateKind 时沿用已保存类型
        JsonNode omitted = json(mockMvc.perform(put("/api/outpatient/plan-templates/{id}", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"scopeType":"PERSONAL","name":"%s-再改",
                                 "services":[%s]}
                                """.formatted(updated.get("revision").asLong(), name, SERVICE.formatted(""))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.templateKind").value("ORDER_SET"))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(post("/api/outpatient/plan-templates/{id}/disable", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":%d}".formatted(omitted.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("INACTIVE"));
        mockMvc.perform(get("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .param("kind", "ORDER_SET").param("keyword", name))
                .andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void order_set_rejects_invalid_kind_empty_content_and_protocol_only_content() throws Exception {
        mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"templateKind":"NOTE","scopeType":"PERSONAL","name":"类型非法",
                                 "services":[%s]}""".formatted(SERVICE.formatted(""))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CLINICAL_TEMPLATE_KIND_INVALID"));
        mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"templateKind\":\"ORDER_SET\",\"scopeType\":\"PERSONAL\",\"name\":\"空组套\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("ORDER_SET_EMPTY"));
        mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"templateKind":"ORDER_SET","scopeType":"PERSONAL","name":"带诊断组套",
                                 "diagnoses":[{"code":"I10","display":"原发性高血压","type":"PRIMARY"}],
                                 "services":[%s]}""".formatted(SERVICE.formatted(""))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("ORDER_SET_CONTENT_INVALID"));
        mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"templateKind":"ORDER_SET","scopeType":"PERSONAL","name":"带任务组套",
                                 "tasks":[{"kind":"CONDITION","text":"慢病复诊","origin":"EXPLICIT","status":"MATCHED"}],
                                 "services":[%s]}""".formatted(SERVICE.formatted(""))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("ORDER_SET_CONTENT_INVALID"));
        mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"templateKind":"ORDER_SET","scopeType":"PERSONAL","name":"带病历组套",
                                 "noteTemplateId":"1","services":[%s]}""".formatted(SERVICE.formatted(""))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("ORDER_SET_CONTENT_INVALID"));
    }

    @Test
    void execution_department_must_be_a_valid_department_of_the_current_organization() throws Exception {
        mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"templateKind":"ORDER_SET","scopeType":"PERSONAL","name":"无效执行科室-%s",
                                 "services":[%s]}""".formatted(UUID.randomUUID().toString().substring(0, 6),
                                SERVICE.formatted(",\"executionDepartmentId\":\"1\""))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PLAN_TEMPLATE_EXECUTION_DEPARTMENT_INVALID"));
    }

    @Test
    void legacy_clients_get_default_selected_true_and_protocol_kind() throws Exception {
        String name = "旧客户端方案-" + UUID.randomUUID().toString().substring(0, 6);
        mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"scopeType":"PERSONAL","name":"%s","medications":[%s],"services":[%s]}
                                """.formatted(name, MEDICATION.formatted(""), SERVICE.formatted(""))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.templateKind").value("PROTOCOL"))
                .andExpect(jsonPath("$.medications[0].defaultSelected").value(true))
                .andExpect(jsonPath("$.services[0].defaultSelected").value(true))
                .andExpect(jsonPath("$.services[0].executionDepartmentId").doesNotExist());
    }

    @Test
    void development_sample_order_set_is_visible_in_the_order_set_catalog_only() throws Exception {
        mockMvc.perform(get("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .param("kind", "ORDER_SET").param("keyword", "血常规复查组套"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].scopeType").value("HOSPITAL"))
                .andExpect(jsonPath("$[0].medications[0].defaultSelected").value(false))
                .andExpect(jsonPath("$[0].services[0].executionDepartmentId").value(Long.parseLong(LAB_DEPARTMENT)));
        mockMvc.perform(get("/api/outpatient/plan-templates").with(rhnWorkContext()).param("keyword", "血常规复查组套"))
                .andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
    }
}
