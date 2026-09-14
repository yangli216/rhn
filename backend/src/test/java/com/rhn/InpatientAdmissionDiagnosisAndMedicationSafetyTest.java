package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.JsonNode;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class InpatientAdmissionDiagnosisAndMedicationSafetyTest extends RhnIntegrationTestSupport {
    private static final String RESIDENT = "362387869790213";
    private static final String BED_01 = "362387869898512";
    private static final String BED_02 = "362387869898513";
    private static final String AMOXICILLIN_PRODUCT = "362387869795111";

    @Autowired JdbcTemplate jdbc;

    @Test
    void admission_diagnoses_are_stage_isolated_and_medication_signing_records_allergy_review() throws Exception {
        JsonNode admission = postJson("/api/inpatient/admissions", """
                {"residentId":"%s","bedId":"%s","admissionTypeCode":"GENERAL",
                 "admissionSourceCode":"DIRECT","admissionReason":"入院诊断与用药安全验收",
                 "commandCode":"IP-ADMISSION-SAFETY-ADMIT"}
                """.formatted(RESIDENT, BED_01), 201);
        String episodeId = admission.get("id").asString();
        String encounterId = admission.get("encounterId").asString();

        String initialDiagnoses = """
                {"expectedEpisodeRevision":0,
                 "diagnoses":[
                   {"code":"J18.900","display":"肺炎，病原体未特指","diagnosisType":"PRIMARY",
                    "verificationStatus":"PROVISIONAL"},
                   {"code":"R05.900","display":"咳嗽","diagnosisType":"SECONDARY",
                    "verificationStatus":"CONFIRMED"}],
                 "commandCode":"IP-ADMISSION-DIAGNOSIS-01"}
                """;
        putJson("/api/inpatient/episodes/" + episodeId + "/admission-diagnoses", initialDiagnoses, 200)
                .andExpect(jsonPath("$.diagnoses.length()").value(2))
                .andExpect(jsonPath("$.diagnoses[0].diagnosisStage").value("ADMISSION"))
                .andExpect(jsonPath("$.diagnoses[0].verificationStatus").value("PROVISIONAL"));
        putJson("/api/inpatient/episodes/" + episodeId + "/admission-diagnoses", initialDiagnoses, 200)
                .andExpect(jsonPath("$.diagnoses.length()").value(2));
        assertEquals(2, count("select count(*) from RHN_VIS_ENC_DIAG_REV "
                + "where ID_ENC=? and SD_DIAG_STAGE='ADMISSION'", encounterId));

        putJson("/api/inpatient/episodes/" + episodeId + "/admission-diagnoses", initialDiagnoses
                        .replace("肺炎，病原体未特指", "肺炎"), 409)
                .andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));

        postJson("/api/inpatient/episodes/" + episodeId + "/transfer", """
                {"expectedRevision":0,"targetBedId":"%s","reason":"靠近护士站观察",
                 "commandCode":"IP-ADMISSION-SAFETY-TRANSFER"}
                """.formatted(BED_02), 200);
        String confirmedDiagnoses = """
                {"expectedEpisodeRevision":0,
                 "diagnoses":[
                   {"code":"J18.900","display":"社区获得性肺炎","diagnosisType":"PRIMARY",
                    "verificationStatus":"CONFIRMED"},
                   {"code":"R05.900","display":"咳嗽","diagnosisType":"SECONDARY",
                    "verificationStatus":"CONFIRMED"}],
                 "commandCode":"IP-ADMISSION-DIAGNOSIS-STALE"}
                """;
        putJson("/api/inpatient/episodes/" + episodeId + "/admission-diagnoses", confirmedDiagnoses, 409)
                .andExpect(jsonPath("$.code").value("INPATIENT_REVISION_CONFLICT"));
        putJson("/api/inpatient/episodes/" + episodeId + "/admission-diagnoses",
                confirmedDiagnoses.replace("expectedEpisodeRevision\":0", "expectedEpisodeRevision\":1")
                        .replace("IP-ADMISSION-DIAGNOSIS-STALE", "IP-ADMISSION-DIAGNOSIS-02"), 200)
                .andExpect(jsonPath("$.diagnoses[0].verificationStatus").value("CONFIRMED"));
        assertEquals(3, count("select count(*) from RHN_VIS_ENC_DIAG_REV "
                + "where ID_ENC=? and SD_DIAG_STAGE='ADMISSION'", encounterId));

        JsonNode nursing = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"NURSING","durationType":"TEMPORARY",
                 "itemCode":"NUR-SAFETY-OBS","itemName":"病情观察","instructions":"观察生命体征",
                 "commandCode":"IP-ADMISSION-SAFETY-NURSING"}
                """.formatted(episodeId), 201);
        String nursingId = nursing.get("id").asString();
        postJson("/api/inpatient/orders/" + nursingId + "/sign",
                command(0, "IP-ADMISSION-SAFETY-NURSING-SIGN"), 200);
        postJson("/api/inpatient/orders/" + nursingId + "/verify",
                command(1, "IP-ADMISSION-SAFETY-NURSING-VERIFY"), 200);
        postJson("/api/inpatient/orders/" + nursingId + "/stop", """
                {"expectedRevision":2,"reason":"安全门禁非药品回归完成",
                 "commandCode":"IP-ADMISSION-SAFETY-NURSING-STOP"}
                """, 200);

        JsonNode medication = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"MEDICATION","durationType":"TEMPORARY",
                 "catalogItemId":"%s","dosageAmount":0.25,"dosageUnit":"g",
                 "routeCode":"ORAL","frequencyCode":"TID","instructions":"饭后口服",
                 "commandCode":"IP-ADMISSION-SAFETY-MEDICATION"}
                """.formatted(episodeId, AMOXICILLIN_PRODUCT), 201);
        String medicationId = medication.get("id").asString();
        postError("/api/inpatient/orders/" + medicationId + "/sign",
                command(0, "IP-ADMISSION-SAFETY-SIGN-UNKNOWN"),
                "INPATIENT_MEDICATION_ALLERGY_STATUS_UNKNOWN");
        postError("/api/inpatient/orders/" + medicationId + "/sign", """
                {"expectedRevision":0,"allergyReviewConfirmed":true,
                 "commandCode":"IP-ADMISSION-SAFETY-SIGN-UNKNOWN-CONFIRM"}
                """, "INPATIENT_MEDICATION_ALLERGY_STATUS_UNKNOWN");

        postJson("/api/residents/" + RESIDENT + "/allergies", """
                {"encounterId":"%s","assertionType":"ALLERGY","categoryCode":"DRUG",
                 "criticalityCode":"HIGH","reactionSeverity":"SEVERE","informationSource":"CLINICIAN",
                 "substanceCodeSystemUri":"urn:rhn:medication","substanceCode":"DRUG-AMOX",
                 "substanceDisplay":"阿莫西林","reactionText":"既往皮疹伴呼吸困难"}
                """.formatted(encounterId), 201);
        postError("/api/inpatient/orders/" + medicationId + "/sign", """
                {"expectedRevision":0,"allergyReviewConfirmed":false,
                 "commandCode":"IP-ADMISSION-SAFETY-SIGN-UNREVIEWED"}
                """, "INPATIENT_MEDICATION_ALLERGY_REVIEW_REQUIRED");
        postError("/api/inpatient/orders/" + medicationId + "/sign", """
                {"expectedRevision":0,"allergyReviewConfirmed":true,
                 "commandCode":"IP-ADMISSION-SAFETY-SIGN-NO-REASON"}
                """, "INPATIENT_MEDICATION_ALLERGY_MATCH");

        String reviewedSign = """
                {"expectedRevision":0,"allergyReviewConfirmed":true,
                 "allergyOverrideReason":"感染治疗获益大于风险，严密观察",
                 "commandCode":"IP-ADMISSION-SAFETY-SIGN-REVIEWED"}
                """;
        JsonNode signed = postJson("/api/inpatient/orders/" + medicationId + "/sign", reviewedSign, 200);
        assertEquals(1, signed.get("revision").asInt());
        assertEquals(1, postJson("/api/inpatient/orders/" + medicationId + "/sign", reviewedSign, 200)
                .get("revision").asInt());
        assertEquals(1, count("select count(*) from RHN_EX_INP_ORDER_EVT "
                + "where ID_CARE_REQ=? and SD_EVT_TYPE='ORDER_SIGNED'", medicationId));
        String eventReason = jdbc.queryForObject("select DES_REASON as reason from RHN_EX_INP_ORDER_EVT "
                + "where ID_CARE_REQ=? and SD_EVT_TYPE='ORDER_SIGNED'", String.class, Long.valueOf(medicationId));
        org.junit.jupiter.api.Assertions.assertTrue(eventReason.contains("过敏核对已确认"));
        org.junit.jupiter.api.Assertions.assertTrue(eventReason.contains("覆盖理由：感染治疗获益大于风险"));
        postJson("/api/inpatient/orders/" + medicationId + "/verify",
                command(1, "IP-ADMISSION-SAFETY-MED-VERIFY"), 200);
        postJson("/api/inpatient/orders/" + medicationId + "/stop", """
                {"expectedRevision":2,"reason":"测试结束停嘱",
                 "commandCode":"IP-ADMISSION-SAFETY-MED-STOP"}
                """, 200);

        recordPrimaryDischargeDiagnosis(episodeId, 1, "J18.900", "社区获得性肺炎",
                "IP-ADMISSION-SAFETY-DISCHARGE-DIAGNOSIS");
        prepareSignedDischargeRecord(RESIDENT, encounterId, "IP-ADMISSION-SAFETY");
        postJson("/api/inpatient/episodes/" + episodeId + "/discharge", """
                {"expectedRevision":1,"dispositionCode":"HOME","note":"病情好转",
                 "commandCode":"IP-ADMISSION-SAFETY-DISCHARGE"}
                """, 200);

        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/admission-diagnoses", episodeId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.diagnoses.length()").value(2))
                .andExpect(jsonPath("$.diagnoses[0].diagnosisStage").value("ADMISSION"))
                .andExpect(jsonPath("$.diagnoses[0].display").value("社区获得性肺炎"));
        assertEquals(2, count("select count(*) from RHN_VIS_ENC_DIAG where ID_ENC=? "
                + "and SD_DIAG_STAGE='ADMISSION' and SD_DIAG_STATUS='ACTIVE'", encounterId));
        assertEquals(1, count("select count(*) from RHN_VIS_ENC_DIAG where ID_ENC=? "
                + "and SD_DIAG_STAGE='DISCHARGE' and SD_DIAG_STATUS='ACTIVE'", encounterId));
        putJson("/api/inpatient/episodes/" + episodeId + "/admission-diagnoses", """
                {"expectedEpisodeRevision":2,
                 "diagnoses":[{"code":"J18.900","display":"肺炎","diagnosisType":"PRIMARY",
                                "verificationStatus":"CONFIRMED"}],
                 "commandCode":"IP-ADMISSION-DIAGNOSIS-AFTER-DISCHARGE"}
                """, 409).andExpect(jsonPath("$.code").value("INPATIENT_EPISODE_NOT_ADMITTED"));
    }

    private JsonNode postJson(String path, String body, int expectedStatus) throws Exception {
        return json(mockMvc.perform(post(path).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(body)).andExpect(status().is(expectedStatus))
                .andReturn().getResponse().getContentAsString());
    }

    private org.springframework.test.web.servlet.ResultActions putJson(String path, String body, int expectedStatus)
            throws Exception {
        return mockMvc.perform(put(path).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expectedStatus));
    }

    private void postError(String path, String body, String code) throws Exception {
        mockMvc.perform(post(path).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value(code));
    }

    private int count(String sql, String id) {
        return jdbc.queryForObject(sql, Integer.class, Long.valueOf(id));
    }

    private static String command(long revision, String commandCode) {
        return "{\"expectedRevision\":" + revision + ",\"commandCode\":\"" + commandCode + "\"}";
    }
}
