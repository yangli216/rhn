package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import org.springframework.test.context.TestPropertySource;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@TestPropertySource(properties = {"rhn.diagnostics.require-settlement-authorization=false",
        "rhn.diagnostics.critical-value.acknowledgement-window=PT7M"})
class DiagnosticExchangeTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void critical_laboratory_result_requires_explicit_acknowledgement_and_is_superseded_by_correction() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String residentId = createResident(suffix);
        String encounterId = createActiveEncounter(residentId);
        JsonNode request = createRequest(encounterId, "362387869795101", "危急值闭环测试");
        String requestNo = request.get("requestNo").asString();

        JsonNode report = json(mockMvc.perform(post("/api/integration/diagnostics/inbound/reports")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(laboratoryReport(suffix, requestNo, "CRITICAL-" + suffix, 1,
                                "FINAL", "CRITICAL-RPT-" + suffix, 32.8, "HH")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());

        JsonNode active = json(mockMvc.perform(get("/api/critical-values").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.reportId == '%s')].status".formatted(report.get("id").asString()))
                        .value("OPEN"))
                .andReturn().getResponse().getContentAsString());
        JsonNode alert = null;
        for (JsonNode item : active) if (item.get("reportId").asString().equals(report.get("id").asString())) alert = item;
        if (alert == null) throw new AssertionError("危急值未形成持久化告警");

        JsonNode reminders = json(mockMvc.perform(get("/api/tasks").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode reminder = java.util.stream.StreamSupport.stream(reminders.spliterator(), false)
                .filter(task -> "CRITICAL_VALUE_ACKNOWLEDGE".equals(task.path("taskType").asString())
                        && encounterId.equals(task.path("encounterId").asString())).findFirst().orElseThrow();
        assertEquals(java.time.Instant.parse(alert.get("acknowledgeDeadlineAt").asString()),
                java.time.Instant.parse(reminder.get("dueAt").asString()));
        assertEquals(java.time.Duration.ofMinutes(7), java.time.Duration.between(
                java.time.Instant.parse(alert.get("detectedAt").asString()),
                java.time.Instant.parse(alert.get("acknowledgeDeadlineAt").asString())));
        assertEquals(alert.get("triggerEvidence").asString(), reminder.get("summary").asString());
        mockMvc.perform(post("/api/tasks/{id}/complete", reminder.get("id").asString()).with(rhnWorkContext()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TASK_BUSINESS_ACTION_REQUIRED"));
        mockMvc.perform(get("/api/tasks").with(rhnWorkContext()))
                .andExpect(jsonPath("$[?(@.id == '%s')].status".formatted(reminder.get("id").asString())).value("READY"));

        mockMvc.perform(post("/api/critical-values/{id}/acknowledge", alert.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":%d,\"note\":\"已确认并联系患者\"}"
                                .formatted(alert.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACKNOWLEDGED"))
                .andExpect(jsonPath("$.acknowledgedAt").isNotEmpty());
        mockMvc.perform(get("/api/tasks").with(rhnWorkContext()))
                .andExpect(jsonPath("$[?(@.id == '%s')]".formatted(reminder.get("id").asString())).isEmpty());

        assertEquals(1, jdbcTemplate.queryForObject("""
                select count(*) from RHN_SYS_WORK_TASK task join RHN_VIS_CRIT_VAL_ALERT alert
                  on task.ID_SRC = alert.ID_CRIT_VAL_ALERT and task.ID_TNT = alert.ID_TNT
                where task.ID_WORK_TASK = ? and task.DT_CMPLD = alert.DT_ACKD
                  and task.ID_USER_CMPLD = alert.ID_USER_ACKD
                """, Integer.class, reminder.get("id").asLong()));
        mockMvc.perform(post("/api/integration/diagnostics/inbound/reports")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(laboratoryReport(suffix + "C", requestNo, "CRITICAL-" + suffix, 2,
                                "CORRECTED", "CRITICAL-RPT-" + suffix, 5.6, "N")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("CORRECTED"));
        mockMvc.perform(get("/api/critical-values").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.reportId == '%s')]".formatted(report.get("id").asString())).isEmpty());
        assertEquals("SUPERSEDED", jdbcTemplate.queryForObject(
                "select SD_STATUS as status from RHN_VIS_CRIT_VAL_ALERT where ID_CRIT_VAL_ALERT = ?", String.class, alert.get("id").asLong()));
    }

    @Test
    void a_corrected_report_cancels_an_unacknowledged_reminder_without_completing_it() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String encounterId = createActiveEncounter(createResident(suffix));
        JsonNode request = createRequest(encounterId, "362387869795101", "未确认告警替代测试");
        String requestNo = request.get("requestNo").asString();
        mockMvc.perform(post("/api/integration/diagnostics/inbound/reports").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(laboratoryReport(suffix, requestNo,
                                "UNACK-" + suffix, 1, "FINAL", "UNACK-RPT-" + suffix, 32.8, "HH")))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/integration/diagnostics/inbound/reports").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(laboratoryReport(suffix + "C", requestNo,
                                "UNACK-" + suffix, 2, "CORRECTED", "UNACK-RPT-" + suffix, 5.6, "N")))
                .andExpect(status().isCreated());
        assertEquals(1, jdbcTemplate.queryForObject("""
                select count(*) from RHN_SYS_WORK_TASK where ID_TNT = ? and ID_ENC = ?
                  and SD_TASK_TYPE = 'CRITICAL_VALUE_ACKNOWLEDGE' and SD_STATUS = 'CANCELLED'
                  and DT_CMPLD is null and ID_USER_CMPLD is null
                """, Integer.class, Long.valueOf(TENANT), Long.valueOf(encounterId)));
    }

    @Test
    void laboratory_and_imaging_requests_exchange_acknowledgements_and_versioned_results_idempotently() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String residentId = createResident(suffix);
        String encounterId = createActiveEncounter(residentId);

        JsonNode laboratory = createRequest(encounterId, "362387869795101", "血常规复查");
        String laboratoryId = laboratory.get("id").asString();
        String requestNo = laboratory.get("requestNo").asString();
        assertEquals("LABORATORY", laboratory.get("serviceType").asString());
        assertEquals("WHOLE_BLOOD", laboratory.get("specimenType").asString());

        JsonNode outbound = json(mockMvc.perform(post(
                                "/api/integration/diagnostics/requests/{id}/outbound-messages", laboratoryId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"endpointCode\":\"LIS-DEMO\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.messageType").value("DIAGNOSTIC_REQUEST"))
                .andExpect(jsonPath("$.relatedResourceId").value(laboratoryId))
                .andExpect(jsonPath("$.payloadDigest").value(org.hamcrest.Matchers.matchesPattern("[0-9A-F]{64}")))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(post("/api/integration/diagnostics/requests/{id}/outbound-messages", laboratoryId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"endpointCode\":\"LIS-DEMO\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(outbound.get("id").asString()))
                .andExpect(jsonPath("$.duplicate").value(true));
        mockMvc.perform(get("/api/integration/diagnostics/outbound-messages")
                        .param("endpointCode", "LIS-DEMO").param("status", "PENDING").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].businessMessageId").value(requestNo + "-R0"));
        mockMvc.perform(post("/api/integration/diagnostics/outbound-messages/{id}/delivery", outbound.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"delivered\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SENT"));

        String acknowledgement = """
                {
                  "endpointCode":"LIS-DEMO","businessMessageId":"ACK-%s",
                  "correlationId":"CORR-%s","outboundBusinessMessageId":"%s-R0",
                  "requestNo":"%s","accepted":true,"externalRequestId":"LIS-REQ-%s"
                }
                """.formatted(suffix, suffix, requestNo, requestNo, suffix);
        mockMvc.perform(post("/api/integration/diagnostics/inbound/acknowledgements")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(acknowledgement))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.inboundMessage.status").value("PROCESSED"))
                .andExpect(jsonPath("$.outboundMessage.status").value("ACKNOWLEDGED"));
        mockMvc.perform(post("/api/integration/diagnostics/inbound/acknowledgements")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(acknowledgement))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.inboundMessage.duplicate").value(true))
                .andExpect(jsonPath("$.outboundMessage.status").value("ACKNOWLEDGED"));

        String reportV1 = laboratoryReport(suffix, requestNo, "LAB-REPORT-" + suffix, 1,
                "FINAL", "RPT-" + suffix, 5.8, "N");
        JsonNode firstReport = json(mockMvc.perform(post("/api/integration/diagnostics/inbound/reports")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(reportV1))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.reportVersion").value(1))
                .andExpect(jsonPath("$.reportType").value("LABORATORY"))
                .andExpect(jsonPath("$.observations[0].valueNumber").value(5.8))
                .andExpect(jsonPath("$.observations[0].unitCode").value("10^9/L"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/integration/diagnostics/inbound/reports")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(reportV1))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(firstReport.get("id").asString()));

        mockMvc.perform(post("/api/integration/diagnostics/inbound/reports")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(reportV1.replace("5.8", "9.8")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EXTERNAL_MESSAGE_IDEMPOTENCY_CONFLICT"));

        String reportV2 = laboratoryReport(suffix + "C", requestNo, "LAB-REPORT-" + suffix, 2,
                "CORRECTED", "RPT-" + suffix, 5.6, "N");
        mockMvc.perform(post("/api/integration/diagnostics/inbound/reports")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(reportV2))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.reportVersion").value(2))
                .andExpect(jsonPath("$.status").value("CORRECTED"))
                .andExpect(jsonPath("$.replacesReportId").value(firstReport.get("id").asString()))
                .andExpect(jsonPath("$.observations[0].status").value("CORRECTED"));

        mockMvc.perform(get("/api/service-requests/{id}/diagnostic-reports", laboratoryId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].reportVersion").value(2));

        JsonNode imaging = createRequest(encounterId, "362387869795103", "腹痛待查");
        String imagingRequestNo = imaging.get("requestNo").asString();
        assertEquals("EXAMINATION", imaging.get("serviceType").asString());
        mockMvc.perform(post("/api/integration/diagnostics/inbound/reports")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "endpointCode":"PACS-DEMO","businessMessageId":"PACS-RPT-%s",
                                  "requestNo":"%s","externalReportId":"PACS-REPORT-%s","reportVersion":1,
                                  "reportType":"IMAGING","status":"FINAL","reportCode":"US-ABD",
                                  "reportName":"腹部超声报告","issuedAt":"2026-08-27T10:20:00Z",
                                  "conclusion":"肝胆胰脾未见明显异常。","authorCode":"IMG-001","authorName":"影像医师",
                                  "observations":[]
                                }
                                """.formatted(suffix, imagingRequestNo, suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.reportType").value("IMAGING"))
                .andExpect(jsonPath("$.conclusion").value("肝胆胰脾未见明显异常。"))
                .andExpect(jsonPath("$.observations").isEmpty());

        mockMvc.perform(get("/api/encounters/{id}/diagnostic-reports", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(3));
        assertEquals(3, jdbcTemplate.queryForObject(
                "select count(*) from RHN_EX_DIAG_REPORT where ID_TNT = ? and ID_ENC = ?",
                Integer.class, Long.valueOf(TENANT), Long.valueOf(encounterId)));
        assertEquals(2, jdbcTemplate.queryForObject(
                "select count(*) from RHN_VIS_OBS where ID_TNT = ? and ID_ENC = ?",
                Integer.class, Long.valueOf(TENANT), Long.valueOf(encounterId)));
    }

    @Test
    void historical_completed_flag_without_report_is_presented_as_unverified() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        JsonNode request = createRequest(createActiveEncounter(createResident(suffix)), "362387869795101", "历史完成标记");
        jdbcTemplate.update("""
                update RHN_EX_DIAG_EXEC_TASK set SD_STATUS = 'COMPLETED', DT_CMPLD = current_timestamp,
                       DES_COMP_NOTE = '旧完成标记' where ID_CARE_REQ = ?
                """, request.get("id").asLong());
        mockMvc.perform(get("/api/diagnostics/worklist").with(rhnWorkContext()).param("status", "EXCEPTION"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.requestId == '%s')].status".formatted(request.get("id").asString())).value("EXCEPTION"))
                .andExpect(jsonPath("$[?(@.requestId == '%s')].exceptionNote".formatted(request.get("id").asString()))
                        .value("任务完成标记与最新有效报告不一致，请核对报告记录"));
        mockMvc.perform(get("/api/diagnostics/worklist").with(rhnWorkContext()).param("status", "COMPLETED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.requestId == '%s')]".formatted(request.get("id").asString())).isEmpty());
        assertEquals("COMPLETED", jdbcTemplate.queryForObject("select SD_STATUS from RHN_EX_DIAG_EXEC_TASK where ID_CARE_REQ = ?",
                String.class, request.get("id").asLong()));
    }

    @Test
    void cancelled_report_removes_task_completion_evidence() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        JsonNode request = createRequest(createActiveEncounter(createResident(suffix)), "362387869795101", "取消报告");
        mockMvc.perform(post("/api/integration/diagnostics/inbound/reports").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(laboratoryReport(suffix,
                                request.get("requestNo").asString(), "CANCEL-" + suffix, 1, "FINAL", "LAB", 5.8, "N")))
                .andExpect(status().isCreated());
        var cancellation = (tools.jackson.databind.node.ObjectNode) json(laboratoryReport(suffix + "C",
                request.get("requestNo").asString(), "CANCEL-" + suffix, 2, "CANCELLED", "LAB", 5.8, "N"));
        cancellation.putArray("observations");
        JsonNode cancelled = json(mockMvc.perform(post("/api/integration/diagnostics/inbound/reports").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(cancellation.toString()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(get("/api/diagnostics/worklist").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.requestId == '%s')].status".formatted(request.get("id").asString())).value("EXCEPTION"))
                .andExpect(jsonPath("$[?(@.requestId == '%s')].reportId".formatted(request.get("id").asString())).value(cancelled.get("id").asString()));
        assertEquals(0, jdbcTemplate.queryForObject("""
                select count(*) from RHN_EX_DIAG_EXEC_TASK where ID_CARE_REQ = ?
                  and (DT_CMPLD is not null or ID_USER_CMPLD is not null or DES_COMP_NOTE is not null)
                """, Integer.class, request.get("id").asLong()));
    }

    @Test
    void report_version_cannot_be_reused_to_replace_another_requests_report() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String encounterId = createActiveEncounter(createResident(suffix));
        JsonNode first = createRequest(encounterId, "362387869795101", "首次申请");
        JsonNode second = createRequest(encounterId, "362387869795101", "另一申请");
        String externalId = "OWNER-" + suffix;
        mockMvc.perform(post("/api/integration/diagnostics/inbound/reports").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(laboratoryReport(suffix, first.get("requestNo").asString(), externalId, 1,
                                "FINAL", "LAB-OWNER", 5.8, "N")))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/integration/diagnostics/inbound/reports").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(laboratoryReport(suffix + "C", second.get("requestNo").asString(), externalId, 2,
                                "CORRECTED", "LAB-OWNER", 5.6, "N")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_REPORT_REQUEST_MISMATCH"));
        mockMvc.perform(get("/api/service-requests/{id}/diagnostic-reports", second.get("id").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get("/api/diagnostics/worklist").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.requestId == '%s')].status".formatted(second.get("id").asString())).value("READY"));
        assertEquals(1, jdbcTemplate.queryForObject("select count(*) from RHN_EX_DIAG_REPORT where ID_EXT_REPORT = ?",
                Integer.class, externalId));
    }

    private JsonNode createRequest(String encounterId, String catalogItemId, String reason) throws Exception {
        return json(mockMvc.perform(post("/api/encounters/{id}/service-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","quantity":1,"priceType":"SALE",
                                 "performerDepartmentId":"%s","businessDate":"2026-08-27","reason":"%s","clinicalDescription":"门诊检查检验申请"}
                                """.formatted(catalogItemId, DEPARTMENT, reason)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private String laboratoryReport(String messageSuffix, String requestNo, String externalReportId,
                                    int version, String status, String reportCode,
                                    double value, String interpretation) {
        return """
                {
                  "endpointCode":"LIS-DEMO","businessMessageId":"LIS-RPT-%s",
                  "correlationId":"LIS-CORR-%s","requestNo":"%s","externalReportId":"%s",
                  "reportVersion":%d,"reportType":"LABORATORY","status":"%s",
                  "reportCode":"%s","reportName":"血细胞分析报告","issuedAt":"2026-08-27T10:15:00Z",
                  "conclusion":"白细胞计数在参考范围内。","authorCode":"LAB-001","authorName":"检验医师",
                  "observations":[{
                    "codeSystemUri":"http://loinc.org","codeRelease":"2.78",
                    "observationCode":"6690-2","observationName":"白细胞计数","valueType":"NUMBER",
                    "effectiveAt":"2026-08-27T09:58:00Z","valueNumber":%s,"unitCode":"10^9/L",
                    "referenceRangeLow":3.5,"referenceRangeHigh":9.5,"interpretationCode":"%s",
                    "performerCode":"LAB-001","performerName":"检验医师"
                  }]
                }
                """.formatted(messageSuffix, messageSuffix, requestNo, externalReportId, version,
                status, reportCode, value, interpretation);
    }

    private String createResident(String suffix) throws Exception {
        String digits = Integer.toUnsignedString(suffix.hashCode());
        String tail = ("0000" + digits).substring(("0000" + digits).length() - 4);
        return json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"诊断交换测试居民","identifiers":[{"system":"9","value":"33010219920808%s","useType":"SECONDARY"}],
                                 "gender":"FEMALE","birthDate":"1992-08-08"}
                                """.formatted(tail)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
    }

    private String createActiveEncounter(String residentId) throws Exception {
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String encounterId = encounter.get("id").asString();
        mockMvc.perform(verifiedEncounterStart(encounterId))
                .andExpect(status().isOk());
        return encounterId;
    }
}
