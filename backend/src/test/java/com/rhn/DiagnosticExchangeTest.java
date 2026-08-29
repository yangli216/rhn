package com.rhn;

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

class DiagnosticExchangeTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void laboratory_and_imaging_requests_exchange_acknowledgements_and_versioned_results_idempotently() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String residentId = createResident(suffix);
        String encounterId = createActiveEncounter(residentId);

        JsonNode laboratory = createRequest(encounterId, "362387869795101", "血常规复查");
        String laboratoryId = laboratory.get("id").asText();
        String requestNo = laboratory.get("requestNo").asText();
        assertEquals("LABORATORY", laboratory.get("serviceType").asText());
        assertEquals("WHOLE_BLOOD", laboratory.get("specimenType").asText());

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
                .andExpect(jsonPath("$.id").value(outbound.get("id").asText()))
                .andExpect(jsonPath("$.duplicate").value(true));
        mockMvc.perform(get("/api/integration/diagnostics/outbound-messages")
                        .param("endpointCode", "LIS-DEMO").param("status", "PENDING").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].businessMessageId").value(requestNo + "-R0"));
        mockMvc.perform(post("/api/integration/diagnostics/outbound-messages/{id}/delivery", outbound.get("id").asText())
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
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(firstReport.get("id").asText()));

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
                .andExpect(jsonPath("$.replacesReportId").value(firstReport.get("id").asText()))
                .andExpect(jsonPath("$.observations[0].status").value("CORRECTED"));

        mockMvc.perform(get("/api/service-requests/{id}/diagnostic-reports", laboratoryId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].reportVersion").value(2));

        JsonNode imaging = createRequest(encounterId, "362387869795103", "腹痛待查");
        String imagingRequestNo = imaging.get("requestNo").asText();
        assertEquals("EXAMINATION", imaging.get("serviceType").asText());
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
                "select count(*) from diagnostic_reports where tenant_id = ? and encounter_id = ?",
                Integer.class, Long.valueOf(TENANT), Long.valueOf(encounterId)));
        assertEquals(2, jdbcTemplate.queryForObject(
                "select count(*) from observations where tenant_id = ? and encounter_id = ?",
                Integer.class, Long.valueOf(TENANT), Long.valueOf(encounterId)));
    }

    private JsonNode createRequest(String encounterId, String catalogItemId, String reason) throws Exception {
        return json(mockMvc.perform(post("/api/encounters/{id}/service-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","quantity":1,"priceType":"SALE",
                                 "businessDate":"2026-08-27","reason":"%s","clinicalDescription":"门诊检查检验申请"}
                                """.formatted(catalogItemId, reason)))
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
                                {"fullName":"诊断交换测试居民","nationalId":"33010219920808%s",
                                 "gender":"FEMALE","birthDate":"1992-08-08"}
                                """.formatted(tail)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private String createActiveEncounter(String residentId) throws Exception {
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String encounterId = encounter.get("id").asText();
        mockMvc.perform(post("/api/encounters/{id}/start", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk());
        return encounterId;
    }
}
