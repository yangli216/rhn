package com.rhn;

import com.rhn.platform.security.RhnPrincipal;
import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import tools.jackson.databind.JsonNode;
import java.util.UUID;
import java.util.Set;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class DiagnosticReportWorkingCopyTest extends SettlementWaivedDiagnosticsTestSupport {
    @Autowired JdbcTemplate jdbc;

    @Test
    void worklist_filters_before_paging_and_keeps_report_evidence_exceptions_searchable() throws Exception {
        var old = startedTask("362387869795101", true);
        var current = startedTask("362387869795101", true);
        var broken = startedTask("362387869795101", true);
        var completed = startedTask("362387869795101", true);
        postJson("/api/diagnostics/tasks/" + completed.get("id").asString() + "/local-reports",
                "{\"expectedRevision\":" + completed.get("revision").asLong() + ",\"observationValue\":\"5.8\"}", 201);
        jdbc.update("update RHN_EX_DIAG_EXEC_TASK set DT_CREATED=? where ID_DIAG_EXEC_TASK=?",
                java.sql.Timestamp.from(java.time.Instant.parse("2026-10-13T18:00:00Z")), completed.get("id").asLong());
        jdbc.update("update RHN_EX_DIAG_EXEC_TASK set DT_CREATED=?, SD_STATUS='COMPLETED', ID_DIAG_REPORT=null where ID_DIAG_EXEC_TASK=?",
                java.sql.Timestamp.from(java.time.Instant.parse("2026-10-13T12:00:00Z")), broken.get("id").asLong());
        jdbc.update("update RHN_EX_DIAG_EXEC_TASK set DT_CREATED=? where ID_DIAG_EXEC_TASK=?",
                java.sql.Timestamp.from(java.time.Instant.parse("2026-10-12T12:00:00Z")), old.get("id").asLong());
        jdbc.update("update RHN_EX_DIAG_EXEC_TASK set DT_CREATED=? where ID_DIAG_EXEC_TASK=?",
                java.sql.Timestamp.from(java.time.Instant.parse("2026-10-13T00:00:00Z")), current.get("id").asLong());
        mockMvc.perform(get("/api/diagnostics/worklist-page").with(rhnWorkContext())
                .param("requestType", "LABORATORY").param("status", "IN_PROGRESS").param("size", "1")
                .param("createdFrom", "2026-10-13T00:00:00Z").param("createdBefore", "2026-10-14T00:00:00Z"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(current.get("id").asString()))
                .andExpect(jsonPath("$.content[0].gender").exists()).andExpect(jsonPath("$.content[0].birthDate").exists());
        mockMvc.perform(get("/api/diagnostics/worklist-page").with(rhnWorkContext())
                .param("requestType", "LABORATORY").param("status", "EXCEPTION").param("size", "1")
                .param("createdFrom", "2026-10-13T00:00:00Z").param("createdBefore", "2026-10-14T00:00:00Z"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(broken.get("id").asString()))
                .andExpect(jsonPath("$.content[0].status").value("EXCEPTION"));
        mockMvc.perform(get("/api/diagnostics/worklist-page").with(rhnWorkContext())
                .param("requestType", "LABORATORY").param("status", "COMPLETED")
                .param("createdFrom", "2026-10-13T00:00:00Z").param("createdBefore", "2026-10-14T00:00:00Z"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(completed.get("id").asString()));
        mockMvc.perform(get("/api/diagnostics/worklist-page").with(rhnWorkContext())
                .param("requestType", "LABORATORY").param("createdBefore", "2026-10-13T00:00:00Z"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content[?(@.id == '%s')]".formatted(current.get("id").asString())).isEmpty());
        mockMvc.perform(get("/api/diagnostics/worklist-page").with(rhnWorkContext())
                .param("requestType", "LABORATORY").param("createdFrom", "2026-10-14T00:00:00Z").param("createdBefore", "2026-10-13T00:00:00Z"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_DATE_RANGE_INVALID"));
    }

    @Test
    void signed_images_are_frozen_and_remain_readable_after_a_correction_removes_them() throws Exception {
        var task = startedTask("362387869795103", false);
        String id = task.get("id").asString();
        var input = objectMapper.createObjectNode();
        input.put("expectedRevision", task.get("revision").asLong());
        input.put("findings", "检查所见"); input.put("conclusion", "检查结论");
        var draft = postJson("/api/diagnostics/tasks/" + id + "/report-draft", input.toString(), 200);
        byte[] png = png();
        String command = UUID.randomUUID().toString();
        var image = uploadImage(task, draft, command, png, 200);
        assertEquals("image/png", image.get("mediaType").asString());
        assertEquals(image.get("id"), uploadImage(task, draft, command, png, 200).get("id"));
        var revisedDraft = readDraft(id);
        assertTrue(revisedDraft.get("revision").asLong() > draft.get("revision").asLong());
        // Adding evidence makes a stale signing request fail.
        mockMvc.perform(post("/api/diagnostics/tasks/{id}/report-draft/issue", id).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(issueInput(task, draft)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_DRAFT_REVISION_CONFLICT"));
        var report = postJson("/api/diagnostics/tasks/" + id + "/report-draft/issue", issueInput(task, revisedDraft), 201);
        assertEquals(1, report.get("images").size());
        assertFalse(report.get("doubleSignatureRequired").asBoolean());
        String printing = """
                {"taskCode":"DIAGNOSTICS.EXAMINATION.REPORT.PRINT",
                 "source":{"sourceType":"DiagnosticReport","sourceId":"%s","encounterId":"%s"},
                 "purpose":"PATIENT_COPY","copies":1,"idempotencyKey":"%s"}
                """.formatted(report.get("id").asString(), task.get("encounterId").asString(), UUID.randomUUID());
        var receipt = postJson("/api/platform/printing/tasks", printing, 201);
        byte[] pdf = mockMvc.perform(get(receipt.get("downloadUrl").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(content().contentType("application/pdf"))
                .andReturn().getResponse().getContentAsByteArray();
        try (var reader = new org.openpdf.text.pdf.PdfReader(pdf)) {
            var text = new org.openpdf.text.pdf.parser.PdfTextExtractor(reader).getTextFromPage(1);
            assertTrue(text.contains("检查所见")); assertTrue(text.contains("原始关键图像"));
            assertNotNull(reader.getPageN(1).getAsDict(org.openpdf.text.pdf.PdfName.RESOURCES).getAsDict(org.openpdf.text.pdf.PdfName.XOBJECT));
        }
        String imageId = image.get("id").asString();
        var content = mockMvc.perform(get("/api/diagnostics/reports/{reportId}/images/{imageId}/content",
                        report.get("id").asString(), imageId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(content().contentType("image/png"))
                .andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray();
        assertArrayEquals(png, content);
        // A formal set cannot be changed in place.
        var completed = task(id); var issuedDraft = readDraft(id);
        mockMvc.perform(delete("/api/diagnostics/tasks/{id}/images/{imageId}", id, imageId).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(revisions(completed, issuedDraft)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_REPORT_ALREADY_ISSUED"));
        input.put("expectedRevision", completed.get("revision").asLong());
        input.put("expectedDraftRevision", issuedDraft.get("revision").asLong());
        input.put("correctionReason", "移除不适用的关键图像");
        var correction = postJson("/api/diagnostics/tasks/" + id + "/report-draft", input.toString(), 200);
        mockMvc.perform(delete("/api/diagnostics/tasks/{id}/images/{imageId}", id, imageId).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(revisions(completed, correction)))
                .andExpect(status().isNoContent());
        var corrected = postJson("/api/diagnostics/tasks/" + id + "/report-draft/issue", issueInput(completed, readDraft(id)), 201);
        assertEquals(0, corrected.get("images").size());
        // An old report cannot be generated again as current, even with a former command.
        mockMvc.perform(post("/api/platform/printing/tasks").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(printing))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_PRINT_CURRENT_REQUIRED"));
        mockMvc.perform(get(receipt.get("downloadUrl").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(content().bytes(pdf));
        mockMvc.perform(get("/api/diagnostics/reports/{reportId}/images/{imageId}/content", report.get("id").asString(), imageId)
                .with(rhnWorkContext())).andExpect(status().isOk()).andExpect(content().bytes(png));
        mockMvc.perform(get("/api/diagnostics/reports/{reportId}/images/{imageId}/content", corrected.get("id").asString(), imageId)
                .with(rhnWorkContext())).andExpect(status().isNotFound());
    }

    @Test
    void image_upload_checks_real_content_limit_and_patient_binding() throws Exception {
        var task = startedTask("362387869795103", false);
        String id = task.get("id").asString();
        var draft = postJson("/api/diagnostics/tasks/" + id + "/report-draft",
                "{\"expectedRevision\":" + task.get("revision").asLong() + ",\"findings\":\"所见\",\"conclusion\":\"结论\"}", 200);
        uploadImage(task, draft, UUID.randomUUID().toString(), "<script>fake png</script>".getBytes(java.nio.charset.StandardCharsets.UTF_8), 400);
        String command = UUID.randomUUID().toString();
        var image = uploadImage(task, draft, command, png(), 200);
        uploadImage(task, draft, command, new byte[]{1, 2, 3}, 409);
        var other = startedTask("362387869795103", false);
        mockMvc.perform(get("/api/diagnostics/tasks/{id}/images/{imageId}/content", other.get("id").asString(), image.get("id").asString())
                .with(rhnWorkContext())).andExpect(status().isNotFound());
        for (int i = 0; i < 3; i++) uploadImage(task, readDraft(id), UUID.randomUUID().toString(), png(), 200);
        uploadImage(task, readDraft(id), UUID.randomUUID().toString(), png(), 409);
        assertEquals(4, json(mockMvc.perform(get("/api/diagnostics/tasks/{id}/images", id).with(rhnWorkContext()))
                .andReturn().getResponse().getContentAsString()).size());
    }

    private JsonNode uploadImage(JsonNode task, JsonNode draft, String command, byte[] bytes, int expected) throws Exception {
        return json(mockMvc.perform(multipart("/api/diagnostics/tasks/{id}/images", task.get("id").asString())
                        .file(new MockMultipartFile("file", "misleading.jpg", "application/octet-stream", bytes))
                        .param("expectedRevision", task.get("revision").asString())
                        .param("expectedDraftRevision", draft.get("revision").asString())
                        .param("commandId", command).param("caption", "原始关键图像").with(rhnWorkContext()))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString());
    }
    private JsonNode readDraft(String id) throws Exception {
        return json(mockMvc.perform(get("/api/diagnostics/tasks/{id}/report-draft", id).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
    private String issueInput(JsonNode task, JsonNode draft) {
        return "{\"expectedRevision\":" + task.get("revision").asLong() + ",\"expectedDraftRevision\":"
                + draft.get("revision").asLong() + ",\"commandId\":\"" + UUID.randomUUID() + "\"}";
    }
    private String revisions(JsonNode task, JsonNode draft) {
        return "{\"expectedRevision\":" + task.get("revision").asLong() + ",\"expectedDraftRevision\":" + draft.get("revision").asLong() + "}";
    }
    private byte[] png() throws Exception {
        var out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(16, 12, BufferedImage.TYPE_INT_RGB), "png", out);
        return out.toByteArray();
    }

    @Test
    void lis_permission_does_not_allow_pacs_queue_or_delivery_updates() throws Exception {
        var task = startedTask("362387869795103", false);
        var outbound = postJson("/api/integration/diagnostics/requests/" + task.get("requestId").asString() + "/outbound-messages",
                "{\"endpointCode\":\"PACS\"}", 201);
        doAnswer(invocation -> {
            Set<?> authorities = (Set<?>) invocation.callRealMethod();
            return authorities.stream().map(String.class::cast).filter(value -> !value.equals("DIAGNOSTICS.INTEGRATION.PACS"))
                    .collect(java.util.stream.Collectors.toSet());
        }).when(workContexts).authoritiesFor(anyLong(), anyLong(), anyLong(), anyLong());
        mockMvc.perform(get("/api/integration/diagnostics/outbound-messages").with(rhnWorkContext()).param("endpointCode", "PACS"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_ACTION_FORBIDDEN"));
        mockMvc.perform(post("/api/integration/diagnostics/outbound-messages/{id}/delivery", outbound.get("id").asString())
                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{\"delivered\":true}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_ACTION_FORBIDDEN"));
        assertEquals("PENDING", jdbc.queryForObject("select SD_STATUS from RHN_INT_EXT_MSG where ID_EXT_MSG=?",
                String.class, outbound.get("id").asLong()));
    }

    @Test
    void laboratory_view_permission_does_not_grant_examination_task_access_or_result_writes() throws Exception {
        var lab = startedTask("362387869795101", true);
        var examination = startedTask("362387869795103", false);
        doAnswer(invocation -> {
            Set<?> authorities = (Set<?>) invocation.callRealMethod();
            return authorities.stream().map(String.class::cast)
                    .filter(value -> !value.startsWith("DIAGNOSTICS.") || value.equals("DIAGNOSTICS.ACCESS")
                            || value.equals("DIAGNOSTICS.LABORATORY.VIEW"))
                    .collect(java.util.stream.Collectors.toSet());
        }).when(workContexts).authoritiesFor(anyLong(), anyLong(), anyLong(), anyLong());
        mockMvc.perform(get("/api/diagnostics/worklist-page").with(rhnWorkContext()).param("requestType", "LABORATORY"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/diagnostics/worklist-page").with(rhnWorkContext()).param("requestType", "EXAMINATION"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_CATEGORY_FORBIDDEN"));
        mockMvc.perform(get("/api/diagnostics/tasks/{id}", examination.get("id").asString()).with(rhnWorkContext()))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/diagnostics/tasks/{id}/report-draft", lab.get("id").asString()).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":" + lab.get("revision").asLong() + ",\"observationValue\":\"5.8\"}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_ACTION_FORBIDDEN"));
        mockMvc.perform(post("/api/diagnostics/tasks/{id}/local-reports", lab.get("id").asString()).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":" + lab.get("revision").asLong() + ",\"observationValue\":\"5.8\"}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_ACTION_FORBIDDEN"));
    }

    @Test
    void saved_multi_indicator_draft_is_not_completion_and_is_issued_idempotently_then_corrected() throws Exception {
        var task=startedTask("362387869795101",true);
        String id=task.get("id").asString(); long revision=task.get("revision").asLong();
        var content=objectMapper.createObjectNode(); content.put("expectedRevision",revision); content.put("expectedDraftRevision",0);
        content.put("conclusion","两个指标的结果");
        content.set("observations",json("""
            [{"observationCode":"WBC","observationName":"白细胞","valueType":"NUMBER","observationValue":"12.3","unitCode":"10^9/L","referenceRangeHigh":9.5},
             {"observationCode":"PRO","observationName":"蛋白质","valueType":"CODE","observationValue":"NEGATIVE"}]
            """));
        var draft=postJson("/api/diagnostics/tasks/"+id+"/report-draft",content.toString(),200);
        assertEquals(0,draft.get("revision").asLong());
        assertEquals("IN_PROGRESS",task(id).get("status").asString());
        mockMvc.perform(get("/api/service-requests/{id}/diagnostic-reports",task.get("requestId").asString()).with(rhnWorkContext()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        // A second save advances only the working copy, and stale saves fail without overwriting it.
        content.put("conclusion","修改后的说明");
        draft=postJson("/api/diagnostics/tasks/"+id+"/report-draft",content.toString(),200);
        mockMvc.perform(post("/api/diagnostics/tasks/{id}/report-draft",id).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(content.toString()))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_DRAFT_REVISION_CONFLICT"));
        String command=UUID.randomUUID().toString();
        String issue="{\"expectedRevision\":"+revision+",\"expectedDraftRevision\":"+draft.get("revision").asLong()+",\"commandId\":\""+command+"\"}";
        var report=postJson("/api/diagnostics/tasks/"+id+"/report-draft/issue",issue,201);
        assertEquals(2,report.get("observations").size());
        assertEquals("H",report.get("observations").get(0).get("interpretationCode").asString());
        assertEquals("NEGATIVE",report.get("observations").get(1).get("valueCode").asString());
        assertTrue(report.get("selfVerified").asBoolean());
        assertEquals(report.get("id"),postJson("/api/diagnostics/tasks/"+id+"/report-draft/issue",issue,201).get("id"));
        var completed=task(id); assertEquals("COMPLETED",completed.get("status").asString());
        var issuedDraft=json(mockMvc.perform(get("/api/diagnostics/tasks/{id}/report-draft",id).with(rhnWorkContext()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        content.put("expectedRevision",completed.get("revision").asLong());
        content.put("expectedDraftRevision",issuedDraft.get("revision").asLong()); content.put("correctionReason","复核后补充说明");
        content.put("commandId",UUID.randomUUID().toString());
        var corrected=postJson("/api/diagnostics/tasks/"+id+"/local-reports",content.toString(),201);
        assertEquals("CORRECTED",corrected.get("status").asString()); assertEquals(2,corrected.get("reportVersion").asInt());
        assertEquals(report.get("id"),corrected.get("replacesReportId"));
        // A late retry still returns its original immutable report after a correction changed the draft.
        assertEquals(report.get("id"),postJson("/api/diagnostics/tasks/"+id+"/report-draft/issue",issue,201).get("id"));
        assertEquals(2,jdbc.queryForObject("select count(*) from RHN_EX_DIAG_REPORT where ID_CARE_REQ=?",Integer.class,Long.valueOf(task.get("requestId").asString())));
    }

    @Test
    void optional_double_sign_blocks_self_signing_without_an_approval_state_machine() throws Exception {
        doReturn(true).when(signing).requiresSecondSigner(any(),anyString(),anyLong());
        var task=startedTask("362387869795101",true); String id=task.get("id").asString();
        var draft=postJson("/api/diagnostics/tasks/"+id+"/report-draft","{\"expectedRevision\":"+task.get("revision").asLong()+",\"observationValue\":\"5.8\"}",200);
        assertTrue(draft.get("doubleSignatureRequired").asBoolean());
        mockMvc.perform(post("/api/diagnostics/tasks/{id}/report-draft/issue",id).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"expectedRevision\":"+task.get("revision").asLong()+",\"expectedDraftRevision\":"+draft.get("revision").asLong()+",\"commandId\":\""+UUID.randomUUID()+"\"}"))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_SECOND_SIGNER_REQUIRED"));
        assertEquals("IN_PROGRESS",task(id).get("status").asString());
    }

    @Test
    void imaging_findings_are_stored_separately_and_local_endpoint_cannot_bypass_signing() throws Exception {
        var task=startedTask("362387869795103",false); String id=task.get("id").asString();
        var report=postJson("/api/diagnostics/tasks/"+id+"/local-reports","{\"expectedRevision\":"+task.get("revision").asLong()+",\"findings\":\"检查所见文本\",\"conclusion\":\"检查结论文本\"}",201);
        assertEquals("检查所见文本",report.get("findings").asString()); assertEquals("检查结论文本",report.get("conclusion").asString());
        mockMvc.perform(post("/api/integration/diagnostics/inbound/reports").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
            {"endpointCode":"RHN-LOCAL","businessMessageId":"bypass","requestNo":"%s","externalReportId":"bypass","reportVersion":1,
            "reportType":"IMAGING","status":"FINAL","reportCode":"EXAM","reportName":"报告","issuedAt":"2026-10-13T01:00:00Z","conclusion":"结论","observations":[]}
            """.formatted(task.get("requestNo").asString())))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_LOCAL_ENDPOINT_RESERVED"));
    }

    @Test
    void another_authorized_person_issues_saved_content_without_submission_or_changing_its_author() throws Exception {
        doReturn(true).when(signing).requiresSecondSigner(any(),anyString(),anyLong());
        var task=startedTask("362387869795101",true); String id=task.get("id").asString();
        var draft=postJson("/api/diagnostics/tasks/"+id+"/report-draft","{\"expectedRevision\":"+task.get("revision").asLong()+",\"observationValue\":\"5.8\"}",200);
        Long reviewer=GlobalIds.next();
        jdbc.update("""
            insert into RHN_SYS_USER_ACCT
            select ?, ID_TNT, ID_PRACT, 'diagnostic-reviewer', HASH_PWD, SD_STATUS,
                DT_PWD_CHANGED, DT_LAST_LOGIN, DT_CREATED, DT_UPDATED, REVISION
            from RHN_SYS_USER_ACCT where ID_USER=362387869790222
            """,reviewer);
        jdbc.update("""
            insert into RHN_SYS_USER_ROLE_ASSIGN
            select ?, ID_TNT, ?, ID_ACC_ROLE, ID_ORG, ID_DEPT, SD_DATA_SCOPE_TYPE,
                DT_VALID_FROM, DT_VALID_TO, ID_USER_GRANTED, DT_CREATED
            from RHN_SYS_USER_ROLE_ASSIGN where ID_USER_ROLE_ASSIGN=362387869796007
            """,GlobalIds.next(),reviewer);
        var auth=new UsernamePasswordAuthenticationToken(new RhnPrincipal(reviewer,Long.valueOf(TENANT),"diagnostic-reviewer"),"test",List.of());
        var report=json(mockMvc.perform(post("/api/diagnostics/tasks/{id}/report-draft/issue",id).with(rhnWorkContext())
                .with(request -> { request.removeHeader("Authorization"); return request; }).with(authentication(auth))
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":"+task.get("revision").asLong()+",\"expectedDraftRevision\":"+draft.get("revision").asLong()+",\"commandId\":\""+UUID.randomUUID()+"\"}"))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertEquals("362387869790222",report.get("authorId").asString());
        assertEquals(reviewer.toString(),report.get("signerId").asString());
        assertFalse(report.get("selfVerified").asBoolean());
    }

    @Test
    void workspace_access_does_not_grant_signing_or_allow_an_inbound_bypass() throws Exception {
        var task=startedTask("362387869795101",true); String id=task.get("id").asString();
        doAnswer(invocation -> {
            Set<?> authorities=(Set<?>)invocation.callRealMethod();
            return authorities.stream().map(String.class::cast).filter(value->!value.endsWith(".SIGN") && !value.startsWith("DIAGNOSTICS.INTEGRATION."))
                .collect(java.util.stream.Collectors.toSet());
        }).when(workContexts).authoritiesFor(anyLong(),anyLong(),anyLong(),anyLong());
        mockMvc.perform(post("/api/diagnostics/tasks/{id}/local-reports",id).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedRevision\":"+task.get("revision").asLong()+",\"observationValue\":\"5.8\"}"))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_ACTION_FORBIDDEN"));
        mockMvc.perform(post("/api/integration/diagnostics/inbound/reports").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
            {"endpointCode":"LIS","businessMessageId":"denied","requestNo":"%s","externalReportId":"denied","reportVersion":1,
            "reportType":"LABORATORY","status":"FINAL","reportCode":"LAB","reportName":"报告","issuedAt":"2026-10-13T01:00:00Z","observations":[]}
            """.formatted(task.get("requestNo").asString())))
            .andExpect(status().isForbidden());
        assertEquals("IN_PROGRESS",task(id).get("status").asString());
    }

    private JsonNode startedTask(String catalog,boolean lab) throws Exception {
        String suffix=UUID.randomUUID().toString().substring(0,8);
        var resident=postJson("/api/residents","{\"fullName\":\"医技草稿测试\",\"gender\":\"2\",\"birthDate\":\"1992-08-08\",\"identifiers\":[{\"system\":\"9\",\"value\":\"DRAFT-"+suffix+"\",\"useType\":\"SECONDARY\"}]}",201);
        var encounter=postJson("/api/encounters","{\"residentId\":\""+resident.get("id").asString()+"\",\"organizationId\":\""+ORGANIZATION+"\",\"departmentId\":\""+DEPARTMENT+"\"}",201);
        mockMvc.perform(verifiedEncounterStart(encounter.get("id").asString())).andExpect(status().isOk());
        var request=postJson("/api/encounters/"+encounter.get("id").asString()+"/service-requests","{\"catalogItemId\":\""+catalog+"\",\"quantity\":1,\"priceType\":\"SALE\",\"performerDepartmentId\":\""+DEPARTMENT+"\",\"pricingRequired\":true,\"reason\":\"测试复查\"}",201);
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
