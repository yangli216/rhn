package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.JsonNode;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class InpatientDiagnosticExecutionFlowTest extends RhnIntegrationTestSupport {
    private static final String RESIDENT = "362387869790213";
    private static final String BED = "362387869898514";
    private static final String SERVICE_ITEM = "362387869795101";
    private static final String TREATMENT_ITEM = "362387869795105";

    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void verified_inpatient_laboratory_order_uses_diagnostic_queue_reports_and_one_execution_charge()
            throws Exception {
        JsonNode admission = postJson("/api/inpatient/admissions", """
                {"residentId":"%s","bedId":"%s","admissionTypeCode":"GENERAL",
                 "admissionSourceCode":"DIRECT","admissionReason":"住院检验执行闭环测试",
                 "commandCode":"IP-DX-ADMIT"}
                """.formatted(RESIDENT, BED), 201);
        String episodeId = admission.get("id").asString();
        String encounterId = admission.get("encounterId").asString();

        JsonNode order = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"SERVICE","durationType":"TEMPORARY",
                 "catalogItemId":"%s","instructions":"复查血细胞分析",
                 "commandCode":"IP-DX-ORDER"}
                """.formatted(episodeId, SERVICE_ITEM), 201);
        String requestId = order.get("id").asString();
        assertEquals(0, count("select count(*) from RHN_EX_DIAG_EXEC_TASK where ID_CARE_REQ = ?", requestId));

        postJson("/api/inpatient/orders/" + requestId + "/sign",
                command(0, "IP-DX-SIGN"), 200);
        postJson("/api/inpatient/orders/" + requestId + "/verify",
                command(1, "IP-DX-VERIFY"), 200);
        assertEquals(1, count("select count(*) from RHN_EX_DIAG_EXEC_TASK where ID_CARE_REQ = ?", requestId));
        assertEquals(1, count("select count(*) from RHN_INT_OUTBOX_EVT where ID_AGG = ? "
                + "and SD_EVT_TYPE = 'INPATIENT_SERVICE_REQUEST_ACTIVATED'", requestId));
        assertEquals(jdbcTemplate.queryForObject("select ID_DEPT_DEFAULT as default_department_id from RHN_BD_ORG_CATALOG_ITEM "
                        + "where ID_TNT = ? and ID_ORG = ? and ID_CATALOG_ITEM = ? and SD_STATUS = 'ACTIVE'",
                Long.class, Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), Long.valueOf(SERVICE_ITEM)),
                jdbcTemplate.queryForObject("select ID_DEPT_EXEC as performer_department_id from RHN_EX_CARE_REQ where ID_CARE_REQ = ?",
                        Long.class, Long.valueOf(requestId)));

        JsonNode worklist = json(mockMvc.perform(get("/api/diagnostics/worklist").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.requestId == '%s')].status".formatted(requestId)).value("READY"))
                .andReturn().getResponse().getContentAsString());
        JsonNode diagnosticTask = findBy(worklist, "requestId", requestId);

        JsonNode isolated = json(mockMvc.perform(get("/api/diagnostics/worklist").with(wardWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertFalse(contains(isolated, "requestId", requestId));
        mockMvc.perform(post("/api/diagnostics/tasks/{id}/collection", diagnosticTask.get("id").asString())
                        .with(wardWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":0,\"specimenNo\":\"IP-DX-WRONG\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("DIAGNOSTIC_TASK_FORBIDDEN"));

        JsonNode plan = postJson("/api/inpatient/orders/" + requestId + "/plans", """
                {"expectedRevision":2,"plannedTimes":["%s"],"commandCode":"IP-DX-PLAN"}
                """.formatted(Instant.now().minusSeconds(30)), 200);
        String inpatientTaskId = plan.at("/tasks/0/id").asString();

        JsonNode collected = json(mockMvc.perform(post("/api/diagnostics/tasks/{id}/collection",
                                diagnosticTask.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":0,\"specimenNo\":\"IP-DX-001\",\"note\":\"静脉血\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COLLECTED"))
                .andReturn().getResponse().getContentAsString());
        JsonNode started = json(mockMvc.perform(post("/api/diagnostics/tasks/{id}/start",
                                diagnosticTask.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":%d}".formatted(collected.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"))
                .andReturn().getResponse().getContentAsString());
        JsonNode report = json(mockMvc.perform(post("/api/diagnostics/tasks/{id}/local-reports",
                                diagnosticTask.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"valueType":"NUMBER","observationValue":"5.8",
                                 "unitCode":"10^9/L","referenceRangeLow":3.5,"referenceRangeHigh":9.5,
                                 "interpretationCode":"N","conclusion":"住院血细胞分析结果正常"}
                                """.formatted(started.get("revision").asLong())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("FINAL"))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(get("/api/diagnostics/worklist").with(rhnWorkContext()).param("status", "COMPLETED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.requestId == '%s')].reportId".formatted(requestId))
                        .value(report.get("id").asString()));
        mockMvc.perform(get("/api/encounters/{id}/diagnostic-reports", encounterId).with(wardWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.requestId == '%s')].conclusion".formatted(requestId))
                        .value("住院血细胞分析结果正常"));
        mockMvc.perform(get("/api/encounters/{id}/diagnostic-reports", encounterId).with(rhnWorkContext()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ENCOUNTER_FORBIDDEN"));

        postJson("/api/inpatient/order-tasks/" + inpatientTaskId + "/execute", """
                {"expectedRevision":0,"outcomeCode":"COMPLETED","commandCode":"IP-DX-EXECUTE"}
                """, 200);
        assertEquals(1, count("select count(*) from RHN_BIL_CHARGE_ITEM where ID_CARE_REQ = ? "
                + "and SD_SRC_TYPE = 'INPATIENT_ORDER_TASK'", requestId));
        assertEquals(0, count("select count(*) from RHN_BIL_CHARGE_ITEM where ID_CARE_REQ = ? "
                + "and SD_SRC_TYPE = 'SERVICE_REQUEST'", requestId));

        JsonNode treatmentOrder = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"SERVICE","durationType":"TEMPORARY",
                 "catalogItemId":"%s","instructions":"住院肌内注射治疗",
                 "commandCode":"IP-TR-ORDER"}
                """.formatted(episodeId, TREATMENT_ITEM), 201);
        String treatmentRequestId = treatmentOrder.get("id").asString();
        postJson("/api/inpatient/orders/" + treatmentRequestId + "/sign",
                command(0, "IP-TR-SIGN"), 200);
        postJson("/api/inpatient/orders/" + treatmentRequestId + "/verify",
                command(1, "IP-TR-VERIFY"), 200);
        JsonNode treatmentWorklist = json(mockMvc.perform(get("/api/treatments/worklist")
                        .with(rhnWorkContext()).param("taskType", "SERVICE"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode treatmentTask = findTreatmentBySource(treatmentWorklist, treatmentRequestId);
        assertEquals("READY", treatmentTask.get("status").asString());
        JsonNode treatmentStarted = json(mockMvc.perform(post("/api/treatments/tasks/{id}/start",
                                treatmentTask.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"identityVerified":true,
                                 "verificationMethod":"NAME_AND_IDENTIFIER","executionSite":"住院治疗室"}
                                """.formatted(treatmentTask.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/treatments/tasks/{id}/complete", treatmentTask.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"resultCode":"COMPLETED",
                                 "note":"住院治疗完成","adverseReaction":false}
                                """.formatted(treatmentStarted.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));

        JsonNode treatmentPlan = postJson("/api/inpatient/orders/" + treatmentRequestId + "/plans", """
                {"expectedRevision":2,"plannedTimes":["%s"],"commandCode":"IP-TR-PLAN"}
                """.formatted(Instant.now().minusSeconds(15)), 200);
        postJson("/api/inpatient/order-tasks/" + treatmentPlan.at("/tasks/0/id").asString() + "/execute", """
                {"expectedRevision":0,"outcomeCode":"COMPLETED","commandCode":"IP-TR-EXECUTE"}
                """, 200);
        assertEquals(1, count("select count(*) from RHN_BIL_CHARGE_ITEM where ID_CARE_REQ = ? "
                + "and SD_SRC_TYPE = 'INPATIENT_ORDER_TASK'", treatmentRequestId));
        assertEquals(0, count("select count(*) from RHN_BIL_CHARGE_ITEM where ID_CARE_REQ = ? "
                + "and SD_SRC_TYPE = 'SERVICE_REQUEST'", treatmentRequestId));
    }

    @Test
    void inpatient_critical_value_is_visible_and_can_be_closed_by_the_current_ward() throws Exception {
        JsonNode admission = postJson("/api/inpatient/admissions", """
                {"residentId":"%s","bedId":"%s","admissionTypeCode":"GENERAL",
                 "admissionSourceCode":"DIRECT","admissionReason":"住院危急值闭环测试",
                 "commandCode":"IP-CV-ADMIT"}
                """.formatted(RESIDENT, BED), 201);
        String encounterId = admission.get("encounterId").asString();
        JsonNode order = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"SERVICE","durationType":"TEMPORARY",
                 "catalogItemId":"%s","instructions":"急查血细胞分析",
                 "commandCode":"IP-CV-ORDER"}
                """.formatted(admission.get("id").asString(), SERVICE_ITEM), 201);
        String requestId = order.get("id").asString();
        postJson("/api/inpatient/orders/" + requestId + "/sign", command(0, "IP-CV-SIGN"), 200);
        postJson("/api/inpatient/orders/" + requestId + "/verify", command(1, "IP-CV-VERIFY"), 200);

        JsonNode worklist = json(mockMvc.perform(get("/api/diagnostics/worklist").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode task = findBy(worklist, "requestId", requestId);
        JsonNode collected = json(mockMvc.perform(post("/api/diagnostics/tasks/{id}/collection",
                                task.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":0,\"specimenNo\":\"IP-CV-001\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode started = json(mockMvc.perform(post("/api/diagnostics/tasks/{id}/start", task.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":" + collected.get("revision").asLong() + "}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/diagnostics/tasks/{id}/local-reports", task.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"valueType":"NUMBER","observationValue":"18.8",
                                 "unitCode":"10^9/L","referenceRangeLow":3.5,"referenceRangeHigh":9.5,
                                 "interpretationCode":"HH","conclusion":"白细胞危急值，请临床及时处理"}
                                """.formatted(started.get("revision").asLong())))
                .andExpect(status().isCreated());

        JsonNode active = json(mockMvc.perform(get("/api/critical-values").with(wardWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].status".formatted(encounterId)).value("OPEN"))
                .andReturn().getResponse().getContentAsString());
        JsonNode alert = findBy(active, "encounterId", encounterId);
        JsonNode acknowledged = json(mockMvc.perform(post("/api/critical-values/{id}/acknowledge",
                                alert.get("id").asString())
                        .with(wardWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":0,\"note\":\"病区已通知值班医生\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACKNOWLEDGED"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/critical-values/{id}/close", alert.get("id").asString())
                        .with(wardWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"dispositionCode":"TREATED",
                                 "note":"已复核患者并完成处置"}
                                """.formatted(acknowledged.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CLOSED"));
        assertEquals(3, count("select count(*) from RHN_VIS_CRIT_VAL_ALERT_EVT where ID_CRIT_VAL_ALERT = ?",
                alert.get("id").asString()));
        mockMvc.perform(get("/api/critical-values").with(wardWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.encounterId == '%s')]".formatted(encounterId)).isEmpty());
    }

    private JsonNode postJson(String path, String body, int expectedStatus) throws Exception {
        return json(mockMvc.perform(post(path).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expectedStatus)).andReturn().getResponse().getContentAsString());
    }

    private static String command(long revision, String commandCode) {
        return "{\"expectedRevision\":" + revision + ",\"commandCode\":\"" + commandCode + "\"}";
    }

    private int count(String sql, String id) {
        return jdbcTemplate.queryForObject(sql, Integer.class, Long.valueOf(id));
    }

    private JsonNode findBy(JsonNode values, String field, String expected) {
        for (JsonNode value : values) if (expected.equals(value.get(field).asString())) return value;
        throw new AssertionError("未找到医技任务：" + expected);
    }

    private boolean contains(JsonNode values, String field, String expected) {
        for (JsonNode value : values) if (expected.equals(value.get(field).asString())) return true;
        return false;
    }

    private JsonNode findTreatmentBySource(JsonNode values, String sourceId) {
        for (JsonNode task : values) {
            for (JsonNode item : task.get("items")) {
                if (sourceId.equals(item.get("sourceId").asString())) return task;
            }
        }
        throw new AssertionError("未找到治疗执行任务：" + sourceId);
    }

    private RequestPostProcessor wardWorkContext() {
        return request -> {
            rhn().postProcessRequest(request);
            ((MockHttpServletRequest) request).addHeader("X-Organization-Id", ORGANIZATION);
            ((MockHttpServletRequest) request).addHeader("X-Department-Id", "362387869898501");
            return request;
        };
    }
}
