package com.rhn;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("outpatient-main-flow")
class OutpatientCompletionCancellationTest extends RhnIntegrationTestSupport {
    @Autowired
    JdbcTemplate jdbc;

    @Test
    void cancelling_completion_returns_the_visit_to_consultation_and_requires_a_full_recompletion() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String digits = "%04d".formatted(Math.floorMod(suffix.hashCode(), 10000));
        String residentId = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"取消诊毕患者%s","identifiers":[{"system":"9","value":"33010219900101%s","useType":"SECONDARY"}],
                                  "gender":"2","birthDate":"1990-01-01","phone":"13800138000"
                                }
                                """.formatted(suffix, digits)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        String encounterId = register(residentId, "CC-REG-" + suffix);
        mockMvc.perform(verifiedEncounterStart(encounterId)).andExpect(status().isOk());
        saveRecord(encounterId, "反复头晕", "原发性高血压", 200);
        String documentId = noteDocumentId(encounterId);
        sign(documentId);
        complete(encounterId);

        mockMvc.perform(post("/api/encounters/{id}/cancel-completion", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"commandCode":"CC-BLANK-%s","reason":"  "}
                                """.formatted(suffix)))
                .andExpect(status().isBadRequest());

        String cancelBody = """
                {"commandCode":"CC-CANCEL-%s","terminalCode":"TEST-DOCTOR","reason":"诊断录入有误，需要更正"}
                """.formatted(suffix);
        mockMvc.perform(post("/api/encounters/{id}/cancel-completion", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(cancelBody))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"));
        mockMvc.perform(post("/api/encounters/{id}/cancel-completion", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(cancelBody))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"));

        mockMvc.perform(get("/api/outpatient/reception/queue").with(rhnWorkContext())
                        .queryParam("date", LocalDate.now().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].status".formatted(encounterId)).value("SERVING"));
        assertEquals(1, jdbc.queryForObject("""
                select count(*) from RHN_VIS_ENC_STATUS_EVT
                where ID_ENC = ? and SD_STATUS_FROM = 'COMPLETED' and SD_STATUS_TO = 'IN_PROGRESS' and CD_COMMAND = ?
                """, Integer.class, Long.valueOf(encounterId), "CC-CANCEL-" + suffix));
        assertEquals(1, jdbc.queryForObject("""
                select count(*) from RHN_VIS_ENC_WORK_SESSION where ID_ENC = ? and SD_STATUS = 'ACTIVE'
                """, Integer.class, Long.valueOf(encounterId)));

        // The signed note stays immutable: it has to be amended before diagnoses can change.
        saveRecord(encounterId, "反复头晕伴恶心", "原发性高血压（更正）", 409);
        var document = json(mockMvc.perform(get("/api/clinical-documents/{id}", documentId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/clinical-documents/{id}/amendments", documentId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedCurrentVersion":%d,"contentSchema":"%s","content":%s,"changeReason":"取消诊毕后更正诊断"}
                                """.formatted(document.get("currentVersion").asInt(), document.get("contentSchema").asString(),
                                document.get("content").toString())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("AMENDMENT_IN_PROGRESS"));
        saveRecord(encounterId, "反复头晕伴恶心", "原发性高血压（更正）", 200);

        mockMvc.perform(post("/api/encounters/{id}/complete", encounterId).with(rhnWorkContext()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DOCUMENT_SIGNATURE_REQUIRED"));
        sign(documentId);
        complete(encounterId);

        // A newer active visit of the same patient blocks reopening, so two visits never run at once.
        register(residentId, "CC-REG2-" + suffix);
        mockMvc.perform(post("/api/encounters/{id}/cancel-completion", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"commandCode":"CC-CANCEL2-%s","reason":"再次更正"}
                                """.formatted(suffix)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ENCOUNTER_ACTIVE_DUPLICATE"));
    }

    private String register(String residentId, String idempotencyCode) throws Exception {
        return json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s","idempotencyCode":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, idempotencyCode)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
    }

    private void saveRecord(String encounterId, String complaint, String diagnosis, int expectedStatus) throws Exception {
        mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"chiefComplaint":"%s","presentIllness":"晨起头晕明显","medicalHistory":"既往血压偏高",
                                 "physicalExam":"神志清","systolic":148,"diastolic":92,
                                 "diagnoses":[{"conceptId":"362387869795011","diagnosisDomain":"WESTERN_MEDICINE",
                                  "code":"I10","display":"%s","type":"PRIMARY"}]}
                                """.formatted(complaint, diagnosis)))
                .andExpect(status().is(expectedStatus));
    }

    private String noteDocumentId(String encounterId) throws Exception {
        return json(mockMvc.perform(get("/api/clinical-documents").param("encounterId", encounterId)
                        .with(rhnWorkContext())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString()).get(0).get("id").asString();
    }

    private void sign(String documentId) throws Exception {
        int version = json(mockMvc.perform(get("/api/clinical-documents/{id}", documentId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("currentVersion").asInt();
        mockMvc.perform(post("/api/clinical-documents/{id}/sign", documentId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedCurrentVersion\":%d,\"signatureMeaning\":\"AUTHOR\"}".formatted(version)))
                .andExpect(status().isOk());
    }

    private void complete(String encounterId) throws Exception {
        mockMvc.perform(post("/api/encounters/{id}/complete", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"dispositionCode\":\"HOME\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));
    }
}
