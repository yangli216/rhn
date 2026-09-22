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
import java.time.temporal.ChronoUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class InpatientNursingAndShiftHandoffTest extends RhnIntegrationTestSupport {
    private static final String WARD_DEPARTMENT = "362387869898501";

    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void appends_protected_nursing_facts_and_formally_signs_an_immutable_handoff_snapshot() throws Exception {
        RequestPostProcessor ward = wardContext();
        JsonNode admission = postJson("/api/inpatient/admissions", """
                {"residentId":"362387869790213","bedId":"362387869898512",
                 "admissionReason":"护理记录与正式交接班验收","nursingLevelCode":"LEVEL_I",
                 "commandCode":"IP-NURSING-ADMIT"}
                """, ward, 201);
        String episodeId = admission.get("id").asString();
        String encounterId = admission.get("encounterId").asString();
        Instant occurredAt = Instant.now();
        String nursingBody = """
                {
                  "occurredAt":"%s","recordType":"CONDITION",
                  "content":{"focus":"发热观察","observation":"精神可，皮肤温热",
                             "intervention":"温水擦浴并嘱饮水","response":"患者配合"},
                  "observationSummary":{"temperatureCelsius":38.2,"pulseRate":96,
                    "respiratoryRate":22,"systolicBloodPressure":128,
                    "diastolicBloodPressure":76,"oxygenSaturation":97,
                    "painScore":2,"consciousnessCode":"ALERT","riskFlags":["FALL"]},
                  "commandCode":"IP-NURSING-RECORD-1"
                }
                """.formatted(occurredAt);
        JsonNode nursing = postJson(
                "/api/inpatient/episodes/" + episodeId + "/nursing-records", nursingBody, ward, 201);
        String nursingId = nursing.get("id").asString();
        assertEquals(episodeId, nursing.get("episodeId").asString());
        assertEquals(encounterId, nursing.get("encounterId").asString());
        assertEquals("发热观察", nursing.at("/content/focus").asString());
        assertEquals("FALL", nursing.at("/observationSummary/riskFlags/0").asString());
        assertEquals("SHA-256", nursing.get("contentDigestAlgorithm").asString());

        JsonNode nursingReplay = postJson("/api/inpatient/episodes/" + episodeId + "/nursing-records",
                nursingBody, ward, 201);
        assertEquals(nursingId, nursingReplay.get("id").asString());
        mockMvc.perform(post("/api/inpatient/episodes/{episodeId}/nursing-records", episodeId)
                        .with(ward).contentType(MediaType.APPLICATION_JSON)
                        .content(nursingBody.replace("精神可", "嗜睡")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INPATIENT_COMMAND_REUSED"));

        Instant assessmentAt = occurredAt.plusSeconds(30);
        String assessmentBody = """
                {
                  "occurredAt":"%s","recordType":"ASSESSMENT",
                  "content":{"focus":"入院护理评估"},
                  "assessment":{"assessmentType":"ADMISSION","admissionMethod":"WALKING",
                    "communicationStatus":"NORMAL","selfCareLevel":"PARTIAL_ASSISTANCE",
                    "mobilityLevel":"ASSISTED","skinStatus":"AT_RISK","nutritionStatus":"NORMAL",
                    "fallRiskLevel":"HIGH","pressureInjuryRiskLevel":"MEDIUM","painScore":1,
                    "riskFlags":["FALL"],"conclusion":"步态不稳，需陪护活动",
                    "immediateActions":["床旁放置防跌倒提示","活动时由家属陪同"]},
                  "commandCode":"IP-NURSING-ASSESSMENT-1"
                }
                """.formatted(assessmentAt);
        JsonNode assessment = postJson(
                "/api/inpatient/episodes/" + episodeId + "/nursing-records", assessmentBody, ward, 201);
        String assessmentId = assessment.get("id").asString();
        assertEquals("ASSESSMENT", assessment.get("recordType").asString());
        assertEquals("HIGH", assessment.at("/assessment/fallRiskLevel").asString());
        assertEquals("床旁放置防跌倒提示", assessment.at("/assessment/immediateActions/0").asString());
        assertEquals(assessmentId, postJson(
                "/api/inpatient/episodes/" + episodeId + "/nursing-records", assessmentBody, ward, 201)
                .get("id").asString());
        mockMvc.perform(post("/api/inpatient/episodes/{episodeId}/nursing-records", episodeId)
                        .with(ward).contentType(MediaType.APPLICATION_JSON).content("""
                                {"occurredAt":"%s","recordType":"ASSESSMENT",
                                 "content":{"focus":"不完整评估"},"commandCode":"IP-NURSING-ASSESSMENT-MISSING"}
                                """.formatted(assessmentAt)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INPATIENT_NURSING_ASSESSMENT_REQUIRED"));

        Instant queryFrom = occurredAt.minus(1, ChronoUnit.HOURS);
        Instant queryTo = occurredAt.plus(1, ChronoUnit.HOURS);
        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/nursing-records", episodeId)
                        .with(ward).queryParam("from", queryFrom.toString()).queryParam("to", queryTo.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(nursingId))
                .andExpect(jsonPath("$[0].recordedBySubjectId").isNotEmpty())
                .andExpect(jsonPath("$[0].integrityEvidenceId").isNotEmpty())
                .andExpect(jsonPath("$[1].id").value(assessmentId))
                .andExpect(jsonPath("$[1].assessment.fallRiskLevel").value("HIGH"));
        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/nursing-records", episodeId)
                        .with(rhnWorkContext()).queryParam("from", queryFrom.toString())
                        .queryParam("to", queryTo.toString()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("INPATIENT_WARD_SCOPE_FORBIDDEN"));

        Instant shiftFrom = occurredAt.minus(2, ChronoUnit.HOURS);
        Instant shiftTo = occurredAt.plus(6, ChronoUnit.HOURS);
        String handoffBody = """
                {
                  "from":"%s","to":"%s","wardSummary":"本班病区运行平稳，重点观察发热患者",
                  "generalItems":["夜班复核抢救车"],
                  "patients":[{"episodeId":"%s","situation":"发热，经物理降温后继续观察",
                    "pendingActions":["22:00复测体温"],"riskFlags":["FALL","FEVER"]}],
                  "commandCode":"IP-HANDOFF-CREATE-1"
                }
                """.formatted(shiftFrom, shiftTo, episodeId);
        JsonNode handoff = postJson("/api/inpatient/shift-handoffs", handoffBody, ward, 201);
        String handoffId = handoff.get("id").asString();
        String contentEvidenceId = handoff.get("integrityEvidenceId").asString();
        assertEquals("DRAFT", handoff.get("status").asString());
        assertEquals("01床", handoff.at("/patients/0/bedNo").asString());
        assertEquals("夜班复核抢救车", handoff.at("/generalItems/0").asString());

        JsonNode replayHandoff = postJson("/api/inpatient/shift-handoffs", handoffBody, ward, 201);
        assertEquals(handoffId, replayHandoff.get("id").asString());
        mockMvc.perform(post("/api/inpatient/shift-handoffs").with(ward)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(handoffBody.replace("运行平稳", "存在异常")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INPATIENT_COMMAND_REUSED"));
        mockMvc.perform(post("/api/inpatient/shift-handoffs").with(ward)
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"from":"%s","to":"%s","wardSummary":"超长班次",
                                 "patients":[],"commandCode":"IP-HANDOFF-TOO-LONG"}
                                """.formatted(shiftFrom, shiftFrom.plus(25, ChronoUnit.HOURS))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INPATIENT_TIME_RANGE_TOO_LONG"));

        JsonNode submitted = postJson("/api/inpatient/shift-handoffs/" + handoffId + "/submit",
                "{\"commandCode\":\"IP-HANDOFF-SUBMIT-1\"}", ward, 200);
        assertEquals("SUBMITTED", submitted.get("status").asString());
        assertEquals("HANDOVER", submitted.at("/signatures/0/signatureMeaning").asString());
        String handoverEvidenceId = submitted.at("/signatures/0/signatureEvidenceId").asString();
        assertNotEquals(contentEvidenceId, handoverEvidenceId);

        JsonNode submitReplay = postJson("/api/inpatient/shift-handoffs/" + handoffId + "/submit",
                "{\"commandCode\":\"IP-HANDOFF-SUBMIT-1\"}", ward, 200);
        assertEquals("SUBMITTED", submitReplay.get("status").asString());
        assertEquals(1, submitReplay.withArray("signatures").size());

        JsonNode accepted = postJson("/api/inpatient/shift-handoffs/" + handoffId + "/accept",
                "{\"commandCode\":\"IP-HANDOFF-ACCEPT-1\"}", ward, 200);
        assertEquals("ACCEPTED", accepted.get("status").asString());
        assertEquals("TAKEOVER", accepted.at("/signatures/1/signatureMeaning").asString());
        assertNotEquals(handoverEvidenceId, accepted.at("/signatures/1/signatureEvidenceId").asString());
        assertEquals(submitted.at("/signatures/0/signedAt").asString(),
                accepted.at("/signatures/0/signedAt").asString());

        mockMvc.perform(get("/api/inpatient/shift-handoffs/{handoffId}", handoffId).with(rhnWorkContext()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("INPATIENT_WARD_SCOPE_FORBIDDEN"));
        mockMvc.perform(get("/api/inpatient/shift-handoffs").with(ward)
                        .queryParam("from", shiftFrom.toString()).queryParam("to", shiftTo.toString())
                        .queryParam("status", "ACCEPTED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(handoffId));

        Instant dischargedAt = Instant.now();
        jdbcTemplate.update("update RHN_VIS_CARE_EPISODE set SD_STATUS = 'DISCHARGED', DT_END = ? where ID_CARE_EPISODE = ?",
                dischargedAt, Long.valueOf(episodeId));
        jdbcTemplate.update("update RHN_VIS_ENC set SD_STATUS = 'COMPLETED', DT_CMPLD = ? where ID_ENC = ?",
                dischargedAt, Long.valueOf(encounterId));
        mockMvc.perform(post("/api/inpatient/episodes/{episodeId}/nursing-records", episodeId)
                        .with(ward).contentType(MediaType.APPLICATION_JSON).content("""
                                {"occurredAt":"%s","recordType":"ROUTINE",
                                 "content":{"note":"出院后不得追加"},
                                 "commandCode":"IP-NURSING-AFTER-DISCHARGE"}
                                """.formatted(dischargedAt)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INPATIENT_NURSING_READ_ONLY"));
        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/nursing-records", episodeId)
                        .with(ward).queryParam("from", queryFrom.toString()).queryParam("to", queryTo.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(nursingId));

        assertEquals(2, jdbcTemplate.queryForObject(
                "select count(*) from RHN_VIS_INP_NURS_RECORD where ID_TNT = ?", Integer.class,
                Long.valueOf(TENANT)));
        assertEquals(1, jdbcTemplate.queryForObject(
                "select count(*) from RHN_VIS_INP_SHIFT_HANDOFF where ID_TNT = ?", Integer.class,
                Long.valueOf(TENANT)));
        assertEquals(2, jdbcTemplate.queryForObject(
                "select count(*) from RHN_VIS_INP_SHIFT_HANDOFF_SIGN where ID_TNT = ?", Integer.class,
                Long.valueOf(TENANT)));
        assertEquals(2, jdbcTemplate.queryForObject(
                "select count(*) from RHN_AUD_CRYPTO_EVID where SD_TARGET_TYPE = 'InpatientShiftHandoff' "
                        + "and SD_PROT_PURPOSE = 'NON_REPUDIATION'", Integer.class));
    }

    private RequestPostProcessor wardContext() {
        return request -> {
            rhn().postProcessRequest(request);
            ((MockHttpServletRequest) request).addHeader("X-Organization-Id", ORGANIZATION);
            ((MockHttpServletRequest) request).addHeader("X-Department-Id", WARD_DEPARTMENT);
            return request;
        };
    }

    private JsonNode postJson(String path, String body, RequestPostProcessor context, int expectedStatus)
            throws Exception {
        return json(mockMvc.perform(post(path).with(context).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expectedStatus)).andReturn().getResponse().getContentAsString());
    }
}
