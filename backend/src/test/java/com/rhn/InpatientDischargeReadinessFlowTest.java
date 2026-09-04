package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.JsonNode;

import java.time.Instant;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class InpatientDischargeReadinessFlowTest extends RhnIntegrationTestSupport {
    private static final String RESIDENT = "362387869790213";
    private static final String BED = "362387869898512";

    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void discharge_is_blocked_until_orders_tasks_and_signed_documents_are_closed_then_remains_read_only()
            throws Exception {
        JsonNode admission = postJson("/api/inpatient/admissions", """
                {
                  "residentId":"%s",
                  "bedId":"%s",
                  "admissionReason":"出院闭环验收",
                  "commandCode":"DISCHARGE-READY-ADMIT"
                }
                """.formatted(RESIDENT, BED), 201);
        String episodeId = admission.get("id").asText();
        String encounterId = admission.get("encounterId").asText();
        recordAdmissionDiagnosis(encounterId);

        JsonNode order = postJson("/api/inpatient/orders", """
                {
                  "episodeId":"%s",
                  "orderCategory":"NURSING",
                  "durationType":"LONG_TERM",
                  "itemCode":"NUR-DISCHARGE-OBS",
                  "itemName":"出院前病情观察",
                  "instructions":"每班观察一般情况",
                  "commandCode":"DISCHARGE-READY-ORDER"
                }
                """.formatted(episodeId), 201);
        String requestId = order.get("id").asText();
        postJson("/api/inpatient/orders/" + requestId + "/sign",
                command(0, "DISCHARGE-READY-SIGN"), 200);
        postJson("/api/inpatient/orders/" + requestId + "/verify",
                command(1, "DISCHARGE-READY-VERIFY"), 200);
        JsonNode planned = postJson("/api/inpatient/orders/" + requestId + "/plans", """
                {
                  "expectedRevision":2,
                  "plannedTimes":["%s"],
                  "commandCode":"DISCHARGE-READY-PLAN"
                }
                """.formatted(Instant.now().minusSeconds(60)), 200);
        String taskId = planned.get("tasks").get(0).get("id").asText();
        String dischargeRecordId = createDraftDischargeRecord(encounterId);

        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/discharge-readiness", episodeId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ready").value(false))
                .andExpect(jsonPath("$.dischargeCompleted").value(false))
                .andExpect(jsonPath("$.openLongTermOrderCount").value(1))
                .andExpect(jsonPath("$.incompleteTemporaryOrderCount").value(0))
                .andExpect(jsonPath("$.pendingTaskCount").value(1))
                .andExpect(jsonPath("$.requiredDocuments[0].status").value("DRAFT"))
                .andExpect(jsonPath("$.requiredDocuments[0].satisfied").value(false))
                .andExpect(jsonPath("$.dischargeDiagnoses.length()").value(0))
                .andExpect(jsonPath("$.blockers[?(@.code == 'INPATIENT_LONG_TERM_ORDER_NOT_STOPPED')].count")
                        .value(1))
                .andExpect(jsonPath("$.blockers[?(@.code == 'INPATIENT_ORDER_TASK_PENDING')].count").value(1))
                .andExpect(jsonPath("$.blockers[?(@.code == 'INPATIENT_DISCHARGE_RECORD_UNSIGNED')].count")
                        .value(1))
                .andExpect(jsonPath("$.blockers[?(@.code == 'INPATIENT_DISCHARGE_DIAGNOSIS_MISSING')].count")
                        .value(1));

        mockMvc.perform(post("/api/inpatient/episodes/{episodeId}/discharge", episodeId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":0,"dispositionCode":"HOME","note":"病情稳定",
                                 "commandCode":"DISCHARGE-READY-BLOCKED"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INPATIENT_DISCHARGE_NOT_READY"))
                .andExpect(jsonPath("$.message", containsString("长期医嘱尚未停止")))
                .andExpect(jsonPath("$.message", containsString("执行任务尚未完成")))
                .andExpect(jsonPath("$.message", containsString("出院记录当前版本尚未签署")))
                .andExpect(jsonPath("$.message", containsString("缺少有效的主要出院诊断")));

        signDocument(dischargeRecordId);
        recordAndReviseDiagnoses(episodeId);
        postJson("/api/inpatient/order-tasks/" + taskId + "/execute", """
                {"expectedRevision":0,"outcomeCode":"COMPLETED","note":"观察完成",
                 "commandCode":"DISCHARGE-READY-TASK"}
                """, 200);

        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/discharge-readiness", episodeId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ready").value(false))
                .andExpect(jsonPath("$.pendingTaskCount").value(0))
                .andExpect(jsonPath("$.blockers.length()").value(1))
                .andExpect(jsonPath("$.blockers[0].code").value("INPATIENT_LONG_TERM_ORDER_NOT_STOPPED"));

        postJson("/api/inpatient/orders/" + requestId + "/stop", """
                {"expectedRevision":3,"reason":"患者办理出院","commandCode":"DISCHARGE-READY-STOP"}
                """, 200);
        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/discharge-readiness", episodeId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ready").value(true))
                .andExpect(jsonPath("$.blockers.length()").value(0))
                .andExpect(jsonPath("$.requiredDocuments[0].status").value("SIGNED"))
                .andExpect(jsonPath("$.dischargeDiagnoses[0].code").value("J18.900"))
                .andExpect(jsonPath("$.dischargeDiagnoses[0].diagnosisStage").value("DISCHARGE"))
                .andExpect(jsonPath("$.dischargeDiagnoses[0].diagnosisType").value("PRIMARY"))
                .andExpect(jsonPath("$.dischargeDiagnoses[0].diagnosisStatus").value("ACTIVE"));

        String dischargeBody = """
                {"expectedRevision":0,"dispositionCode":"HOME","note":"病情稳定，居家康复",
                 "commandCode":"DISCHARGE-READY-COMPLETE"}
                """;
        postJson("/api/inpatient/episodes/" + episodeId + "/discharge", dischargeBody, 200);
        postJson("/api/inpatient/episodes/" + episodeId + "/discharge", dischargeBody, 200);

        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/discharge-readiness", episodeId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.episodeStatus").value("DISCHARGED"))
                .andExpect(jsonPath("$.dischargeCompleted").value(true))
                .andExpect(jsonPath("$.ready").value(true));
        mockMvc.perform(get("/api/inpatient/bootstrap").with(rhnWorkContext()).queryParam("status", "ALL"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.episodes[0].id").value(episodeId))
                .andExpect(jsonPath("$.episodes[0].status").value("DISCHARGED"))
                .andExpect(jsonPath("$.episodes[0].dischargeDispositionCode").value("HOME"))
                .andExpect(jsonPath("$.episodes[0].dischargeNote").value("病情稳定，居家康复"));
        mockMvc.perform(get("/api/clinical-documents").with(rhnWorkContext())
                        .queryParam("encounterId", encounterId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.documentType == 'INPATIENT_DISCHARGE_RECORD')].status")
                        .value("SIGNED"));
        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/discharge-diagnoses", episodeId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.diagnoses.length()").value(1))
                .andExpect(jsonPath("$.diagnoses[0].diagnosisStage").value("DISCHARGE"))
                .andExpect(jsonPath("$.diagnoses[0].display").value("社区获得性肺炎"));
        mockMvc.perform(put("/api/inpatient/episodes/{episodeId}/discharge-diagnoses", episodeId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedEpisodeRevision":1,
                                 "diagnoses":[{"code":"J18.900","display":"肺炎","diagnosisType":"PRIMARY"}],
                                 "commandCode":"DISCHARGE-READY-DIAGNOSIS-AFTER-DISCHARGE"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INPATIENT_EPISODE_NOT_ADMITTED"));
    }

    private String createDraftDischargeRecord(String encounterId) throws Exception {
        JsonNode response = postJson("/api/clinical-documents", """
                {
                  "residentId":"%s","encounterId":"%s","organizationId":"%s","departmentId":"%s",
                  "documentType":"INPATIENT_DISCHARGE_RECORD","title":"出院记录",
                  "contentSchema":"RHN.CANVAS_EDITOR_DOCUMENT.V1",
                  "content":{"plainText":"病情好转，拟出院","structuredValues":{}},
                  "changeReason":"创建出院记录"
                }
                """.formatted(RESIDENT, encounterId, ORGANIZATION, DEPARTMENT), 201);
        return response.get("id").asText();
    }

    private void signDocument(String documentId) throws Exception {
        postJson("/api/clinical-documents/" + documentId + "/sign",
                "{\"expectedCurrentVersion\":1,\"signatureMeaning\":\"AUTHOR\"}", 200);
    }

    private void recordAndReviseDiagnoses(String episodeId) throws Exception {
        String initial = """
                {
                  "expectedEpisodeRevision":0,
                  "diagnoses":[
                    {"code":"J18.900","display":"肺炎","diagnosisType":"PRIMARY"},
                    {"code":"R50.900","display":"发热","diagnosisType":"SECONDARY"}
                  ],
                  "commandCode":"DISCHARGE-READY-DIAGNOSIS-01"
                }
                """;
        putDiagnoses(episodeId, initial)
                .andExpect(jsonPath("$.diagnoses.length()").value(2));
        putDiagnoses(episodeId, initial)
                .andExpect(jsonPath("$.diagnoses.length()").value(2));
        putDiagnoses(episodeId, """
                {
                  "expectedEpisodeRevision":0,
                  "diagnoses":[
                    {"code":"J18.900","display":"社区获得性肺炎","diagnosisType":"PRIMARY"}
                  ],
                  "commandCode":"DISCHARGE-READY-DIAGNOSIS-02"
                }
                """)
                .andExpect(jsonPath("$.diagnoses.length()").value(1))
                .andExpect(jsonPath("$.diagnoses[0].display").value("社区获得性肺炎"));
        org.junit.jupiter.api.Assertions.assertEquals(2, jdbcTemplate.queryForObject(
                "select count(*) from RHN_VIS_ENC_DIAG where ID_ENC = (select id from RHN_VIS_ENC where ID_CARE_EPISODE=?) and SD_DIAG_STAGE='DISCHARGE'",
                Integer.class, Long.valueOf(episodeId)));
        org.junit.jupiter.api.Assertions.assertEquals(1, jdbcTemplate.queryForObject(
                "select count(*) from RHN_VIS_ENC_DIAG where ID_ENC = (select id from RHN_VIS_ENC where ID_CARE_EPISODE=?) and SD_DIAG_STAGE='DISCHARGE' and SD_DIAG_STATUS='ACTIVE'",
                Integer.class, Long.valueOf(episodeId)));
        org.junit.jupiter.api.Assertions.assertEquals(4, jdbcTemplate.queryForObject(
                "select count(*) from RHN_VIS_ENC_DIAG_REV where ID_ENC = "
                        + "(select ID_ENC as id from RHN_VIS_ENC where ID_CARE_EPISODE=?) and diagnosis_stage='DISCHARGE'",
                Integer.class, Long.valueOf(episodeId)));
        org.junit.jupiter.api.Assertions.assertEquals(1, jdbcTemplate.queryForObject(
                "select count(*) from RHN_VIS_ENC_DIAG where ID_ENC = (select id from RHN_VIS_ENC where ID_CARE_EPISODE=?) and SD_DIAG_STAGE='ADMISSION' and SD_DIAG_STATUS='ACTIVE'",
                Integer.class, Long.valueOf(episodeId)));
    }

    private void recordAdmissionDiagnosis(String encounterId) {
        jdbcTemplate.update("""
                insert into RHN_VIS_ENC_DIAG (
                    ID_ENC_DIAG, ID_TNT, ID_ENC, SD_DIAG_STAGE, CD_ENC_DIAG, NA_DISPLAY, SD_DIAG_TYPE, DT_RECORDED,
                    REVISION, CD_BUSINESS_VER_NO, SD_VERIFICATION_STATUS, SD_DIAG_STATUS, DT_UPDATED
                ) values (?, ?, ?, 'ADMISSION', 'R05.900', '咳嗽', 'PRIMARY', current_timestamp,
                    0, 1, 'CONFIRMED', 'ACTIVE', current_timestamp)
                """, com.rhn.shared.id.GlobalIds.next(), Long.valueOf(TENANT), Long.valueOf(encounterId));
    }

    private org.springframework.test.web.servlet.ResultActions putDiagnoses(String episodeId, String body)
            throws Exception {
        return mockMvc.perform(put("/api/inpatient/episodes/{episodeId}/discharge-diagnoses", episodeId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
    }

    private JsonNode postJson(String path, String body, int expectedStatus) throws Exception {
        String response = mockMvc.perform(post(path).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expectedStatus)).andReturn().getResponse().getContentAsString();
        return json(response);
    }

    private static String command(long revision, String commandCode) {
        return "{\"expectedRevision\":" + revision + ",\"commandCode\":\"" + commandCode + "\"}";
    }
}
