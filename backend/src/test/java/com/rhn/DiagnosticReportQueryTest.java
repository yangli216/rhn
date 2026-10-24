package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class DiagnosticReportQueryTest extends SettlementWaivedDiagnosticsTestSupport {
    @Autowired JdbcTemplate jdbc;

    private JsonNode report(JsonNode task, boolean lab) throws Exception {
        return postJson("/api/diagnostics/tasks/" + task.get("id").asString() + "/local-reports",
                "{\"expectedRevision\":" + task.get("revision").asLong() + (lab
                ? ",\"valueType\":\"NUMBER\",\"observationValue\":\"5.8\",\"conclusion\":\"原始检验结论\"}"
                : ",\"findings\":\"原始检查所见\",\"conclusion\":\"原始检查结论\"}"), 201);
    }

    @Test
    void queries_versions_before_paging_and_keeps_correction_evidence_immutable() throws Exception {
        var task = startedTask("362387869795101", true);
        var original = report(task, true);
        var current = task(task.get("id").asString());
        var draft = json(mockMvc.perform(get("/api/diagnostics/tasks/{id}/report-draft", task.get("id").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var correction = postJson("/api/diagnostics/tasks/" + task.get("id").asString() + "/local-reports",
                "{\"expectedRevision\":" + current.get("revision").asLong()
                + ",\"expectedDraftRevision\":" + draft.get("revision").asLong() + ",\"valueType\":\"NUMBER\",\"observationValue\":\"6.0\",\"correctionReason\":\"复核更正\",\"conclusion\":\"更正后结论\"}", 201);
        String requestNo = task.get("requestNo").asString();
        mockMvc.perform(get("/api/diagnostics/reports").with(rhnWorkContext()).param("requestType", "LABORATORY")
                .param("keyword", requestNo).param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.totalPages").value(2)).andExpect(jsonPath("$.content[0].id").value(correction.get("id").asString()))
                .andExpect(jsonPath("$.content[0].current").value(true)).andExpect(jsonPath("$.content[0].taskId").value(task.get("id").asString()));
        mockMvc.perform(get("/api/diagnostics/reports").with(rhnWorkContext()).param("requestType", "LABORATORY")
                .param("keyword", requestNo).param("size", "1").param("page", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].id").value(original.get("id").asString()))
                .andExpect(jsonPath("$.content[0].current").value(false));
        mockMvc.perform(get("/api/diagnostics/reports").with(rhnWorkContext()).param("requestType", "LABORATORY")
                .param("keyword", requestNo).param("status", "FINAL"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].current").value(false));
        mockMvc.perform(get("/api/diagnostics/reports/{id}/history", original.get("id").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].correctionReason").value("复核更正"))
                .andExpect(jsonPath("$[1].conclusion").value("原始检验结论"))
                .andExpect(jsonPath("$[1].observations[0].valueNumber").value(5.8));
    }

    @Test
    void filters_report_issue_dates_not_request_dates_and_escapes_literal_search() throws Exception {
        var task = startedTask("362387869795103", false);
        var report = report(task, false);
        jdbc.update("update RHN_EX_DIAG_REPORT set DT_ISSUED=?, CD_REPORT='QUERY%_LITERAL' where ID_DIAG_REPORT=?",
                java.sql.Timestamp.from(java.time.Instant.parse("2024-01-01T00:00:00Z")), report.get("id").asLong());
        mockMvc.perform(get("/api/diagnostics/reports").with(rhnWorkContext()).param("requestType", "EXAMINATION")
                .param("keyword", "%_LITERAL").param("issuedFrom", "2024-01-01T00:00:00Z").param("issuedBefore", "2024-01-02T00:00:00Z"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].reportType").value("IMAGING"));
        mockMvc.perform(get("/api/diagnostics/reports").with(rhnWorkContext()).param("requestType", "EXAMINATION")
                .param("keyword", "%_LITERAL").param("issuedBefore", "2024-01-01T00:00:00Z"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        mockMvc.perform(get("/api/diagnostics/reports").with(rhnWorkContext()).param("requestType", "LABORATORY").param("keyword", "%_LITERAL"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void query_and_history_never_cross_performing_department_even_with_clinical_access() throws Exception {
        var task = startedTask("362387869795101", true); var report = report(task, true);
        jdbc.update("update RHN_EX_DIAG_REPORT set ID_DEPT=362387869899101 where ID_DIAG_REPORT=?", report.get("id").asLong());
        mockMvc.perform(get("/api/diagnostics/reports").with(rhnWorkContext()).param("requestType", "LABORATORY")
                .param("keyword", task.get("requestNo").asString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        mockMvc.perform(get("/api/diagnostics/reports/{id}/history", report.get("id").asString()).with(rhnWorkContext()))
                .andExpect(status().isForbidden());
    }

    @Test
    void read_requires_category_authority_and_valid_filters() throws Exception {
        mockMvc.perform(get("/api/diagnostics/reports").with(rhnWorkContext()).param("requestType", "LABORATORY")
                .param("issuedFrom", "2026-10-14T00:00:00Z").param("issuedBefore", "2026-10-13T00:00:00Z"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_REPORT_DATE_RANGE_INVALID"));
        mockMvc.perform(get("/api/diagnostics/reports").with(rhnWorkContext()).param("requestType", "EXAMINATION").param("status", "UNKNOWN"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_REPORT_STATUS_INVALID"));
        doAnswer(invocation -> {
            java.util.Set<?> authorities = (java.util.Set<?>) invocation.callRealMethod();
            return authorities.stream().map(String.class::cast).filter(value -> !value.equals("ROLE_ADMIN") && !value.startsWith("DIAGNOSTICS.EXAMINATION."))
                    .collect(java.util.stream.Collectors.toSet());
        }).when(workContexts).authoritiesFor(anyLong(), anyLong(), anyLong(), anyLong());
        mockMvc.perform(get("/api/diagnostics/reports").with(rhnWorkContext()).param("requestType", "EXAMINATION"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_CATEGORY_FORBIDDEN"));
    }

    @Test
    void focused_queue_keeps_old_pending_and_broken_tasks_but_excludes_old_terminal_records() throws Exception {
        var pending = startedTask("362387869795101", true);
        var old = startedTask("362387869795101", true); report(old, true);
        var recent = startedTask("362387869795101", true); report(recent, true);
        var broken = startedTask("362387869795101", true);
        var cancelled = startedTask("362387869795101", true);
        String name = "QUEUE-" + UUID.randomUUID();
        for (var task : java.util.List.of(pending, old, recent, broken, cancelled)) jdbc.update(
                "update RHN_EX_DIAG_EXEC_TASK set DT_CREATED=?, NA_ITEM_SNAP=? where ID_DIAG_EXEC_TASK=?",
                java.sql.Timestamp.from(java.time.Instant.parse("2020-01-01T00:00:00Z")), name, task.get("id").asLong());
        jdbc.update("update RHN_EX_DIAG_EXEC_TASK set DT_CMPLD=? where ID_DIAG_EXEC_TASK=?",
                java.sql.Timestamp.from(java.time.Instant.parse("2020-01-01T00:00:00Z")), old.get("id").asLong());
        jdbc.update("update RHN_EX_DIAG_EXEC_TASK set SD_STATUS='COMPLETED', ID_DIAG_REPORT=null where ID_DIAG_EXEC_TASK=?", broken.get("id").asLong());
        jdbc.update("update RHN_EX_DIAG_EXEC_TASK set SD_STATUS='CANCELLED', DT_CNCLD=? where ID_DIAG_EXEC_TASK=?",
                java.sql.Timestamp.from(java.time.Instant.parse("2020-01-01T00:00:00Z")), cancelled.get("id").asLong());
        mockMvc.perform(get("/api/diagnostics/worklist-page").with(rhnWorkContext()).param("requestType", "LABORATORY")
                .param("keyword", name).param("activeAndRecent", "true"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.content[?(@.id == '%s')]".formatted(old.get("id").asString())).isEmpty())
                .andExpect(jsonPath("$.content[?(@.id == '%s')]".formatted(cancelled.get("id").asString())).isEmpty())
                .andExpect(jsonPath("$.content[?(@.id == '%s')].status".formatted(broken.get("id").asString())).value("EXCEPTION"));
        mockMvc.perform(get("/api/diagnostics/tasks/{id}", old.get("id").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));
    }
    private JsonNode startedTask(String catalog,boolean lab) throws Exception {
        String suffix=UUID.randomUUID().toString().substring(0,8);
        var resident=postJson("/api/residents","{\"fullName\":\"医技草稿测试\",\"gender\":\"2\",\"birthDate\":\"1992-08-08\",\"identifiers\":[{\"system\":\"9\",\"value\":\"DRAFT-"+suffix+"\",\"useType\":\"SECONDARY\"}]}",201);
        var encounter=postJson("/api/encounters","{\"residentId\":\""+resident.get("id").asString()+"\",\"organizationId\":\""+ORGANIZATION+"\",\"departmentId\":\""+DEPARTMENT+"\"}",201);
        mockMvc.perform(verifiedEncounterStart(encounter.get("id").asString())).andExpect(status().isOk());
        var request=postJson("/api/encounters/"+encounter.get("id").asString()+"/service-requests","{\"catalogItemId\":\""+catalog+"\",\"quantity\":1,\"priceType\":\"SALE\",\"performerDepartmentId\":\""+DEPARTMENT+"\",\"pricingRequired\":true,\"reason\":\"测试复查\""+(lab?"":",\"bodySiteCodes\":[\"ABDOMEN\"]")+"}",201);
        var values=json(mockMvc.perform(get("/api/diagnostics/worklist").with(rhnWorkContext())).andReturn().getResponse().getContentAsString());
        JsonNode task=null; for(var value:values) if(value.get("requestId").equals(request.get("id"))) task=value;
        assertNotNull(task);
        if(lab) task=postJson("/api/diagnostics/tasks/"+task.get("id").asString()+"/collection","{\"expectedRevision\":"+task.get("revision").asLong()+",\"specimenNo\":\"TUBE-"+suffix+"\"}",200);
        return postJson("/api/diagnostics/tasks/"+task.get("id").asString()+"/start","{\"expectedRevision\":"+task.get("revision").asLong()+"}",200);
    }
    private JsonNode task(String id) throws Exception {
        var values=json(mockMvc.perform(get("/api/diagnostics/worklist").with(rhnWorkContext())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        for(var value:values) if(value.get("id").asString().equals(id)) return value;
        throw new AssertionError("Missing task "+id);
    }
    private JsonNode postJson(String url,String body,int expectedStatus) throws Exception {
        return json(mockMvc.perform(post(url).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().is(expectedStatus)).andReturn().getResponse().getContentAsString());
    }
}
