package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DiagnosisManagementEvidenceTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;

    @Test void missingPersistedManagementSnapshotIsNotReportedAsConfirmedNoPrograms() throws Exception {
        String encounter = encounter();
        save(encounter, true);
        jdbc.update("update RHN_VIS_ENC_DIAG set JSON_MGMT_SNAP=null where ID_ENC=?", Long.valueOf(encounter));

        var response = json(mockMvc.perform(get("/api/encounters/{id}", encounter).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("diagnoses").get(0);
        assertEquals("I10", response.path("code").asString());
        assertEquals("UNCONFIRMED", response.path("managementResolutionStatus").asString());
        assertTrue(response.path("managementPrograms").isNull());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"", "{}", "{\"programs\":null}", "{\"programs\":[null]}",
            "{\"programs\":[{}]}", "{\"programs\":[],\"resolutionStatus\":\"UNKNOWN\"}", "{broken", "{\"programs\":[],\"programs\":null}"})
    void invalidPersistedEvidenceKeepsTheDiagnosisButMarksItsRulesUnconfirmed(String snapshot) throws Exception {
        String encounter = encounter();
        save(encounter, true);
        jdbc.update("update RHN_VIS_ENC_DIAG set JSON_MGMT_SNAP=? where ID_ENC=?", snapshot, Long.valueOf(encounter));
        var diagnosis = json(mockMvc.perform(get("/api/encounters/{id}", encounter).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("diagnoses").get(0);
        assertEquals("I10", diagnosis.path("code").asString());
        assertEquals("UNCONFIRMED", diagnosis.path("managementResolutionStatus").asString());
        assertTrue(diagnosis.path("managementPrograms").isNull());
    }

    @Test void catalogAndFreeCodedDiagnosesPublishDifferentEvidence() throws Exception {
        String catalogEncounter = encounter();
        var saved = save(catalogEncounter, true);
        var diagnosis = saved.path("diagnoses").get(0);
        assertEquals("CONFIRMED", diagnosis.path("managementResolutionStatus").asString());
        assertEquals("CHRONIC_HYPERTENSION", diagnosis.path("managementPrograms").get(0).path("code").asString());
        var knownEvent = diagnosisEvent(saved.path("residentId").asString());
        assertEquals("CONFIRMED", knownEvent.path("managementResolutionStatus").asString());
        assertEquals("CHRONIC_HYPERTENSION", knownEvent.path("managementPrograms").get(0).path("code").asString());

        String manualEncounter = encounter();
        var manual = save(manualEncounter, false);
        assertEquals("UNCONFIRMED", manual.path("diagnoses").get(0).path("managementResolutionStatus").asString());
        assertTrue(manual.path("diagnoses").get(0).path("managementPrograms").isNull());
        var unknownEvent = diagnosisEvent(manual.path("residentId").asString());
        assertEquals("UNCONFIRMED", unknownEvent.path("managementResolutionStatus").asString());
        assertFalse(unknownEvent.has("managementPrograms"));

        jdbc.update("update RHN_VIS_ENC_DIAG set JSON_MGMT_SNAP=? where ID_ENC=?", "{\"programs\":[]}", Long.valueOf(manualEncounter));
        var legacy = json(mockMvc.perform(get("/api/encounters/{id}", manualEncounter).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("diagnoses").get(0);
        assertEquals("UNCONFIRMED", legacy.path("managementResolutionStatus").asString());
        assertTrue(legacy.path("managementPrograms").isNull());
    }

    @Test void catalogBackedHistoricalEmptySnapshotRemainsConfirmedWithoutLookingUpTodaysRules() throws Exception {
        String encounter = encounter();
        save(encounter, true);
        // An explicitly captured empty catalog snapshot is evidence even when today's concept has rules.
        jdbc.update("update RHN_VIS_ENC_DIAG set JSON_MGMT_SNAP=? where ID_ENC=?", "{\"programs\":[]}", Long.valueOf(encounter));
        var diagnosis = json(mockMvc.perform(get("/api/encounters/{id}", encounter).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("diagnoses").get(0);
        assertEquals("CONFIRMED", diagnosis.path("managementResolutionStatus").asString());
        assertEquals(0, diagnosis.path("managementPrograms").size());
    }

    @Test void publishesRequiredResolutionStatusAndNullableProgramsContract() throws Exception {
        String document = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        var schema = json(document).path("components").path("schemas").path("DiagnosisResponse");
        assertTrue(schema.path("required").toString().contains("\"managementResolutionStatus\""));
        assertTrue(schema.path("properties").path("managementResolutionStatus").path("enum").toString().contains("UNCONFIRMED"));
        assertTrue(schema.path("properties").path("managementPrograms").path("type").toString().contains("null"));
        String export = System.getProperty("rhn.diagnosis-management.openapi-export");
        if (export != null) java.nio.file.Files.writeString(java.nio.file.Path.of(export), document);
    }

    private tools.jackson.databind.JsonNode diagnosisEvent(String resident) throws Exception {
        var events = json(mockMvc.perform(get("/api/residents/{id}/timeline", resident).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        for (var event : events) if ("DIAGNOSIS_RECORDED".equals(event.path("eventType").asString())) return event.path("details");
        throw new AssertionError("Expected persisted diagnosis event");
    }

    private String encounter() throws Exception {
        var resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"fullName":"诊断管理证据测试","identifiers":[{"system":"9","value":"%s","useType":"SECONDARY"}],
                 "gender":"FEMALE","birthDate":"1992-03-04"}
                """.formatted(UUID.randomUUID()))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        var encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"residentId":"%s","organizationId":"%s","departmentId":"%s","idempotencyCode":"%s"}
                """.formatted(resident.path("id").asString(), ORGANIZATION, DEPARTMENT, UUID.randomUUID())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String id = encounter.path("id").asString();
        mockMvc.perform(verifiedEncounterStart(id)).andExpect(status().isOk());
        return id;
    }

    private tools.jackson.databind.JsonNode save(String encounter, boolean catalog) throws Exception {
        return save(encounter, catalog, UUID.randomUUID().toString());
    }

    @Test void oldIdempotencyReceiptsCannotReintroduceConfirmedEmptyManagementRules() throws Exception {
        String encounter = encounter();
        String command = UUID.randomUUID().toString();
        var receipt = save(encounter, true, command);
        var oldDiagnosis = (tools.jackson.databind.node.ObjectNode) receipt.path("diagnoses").get(0);
        oldDiagnosis.remove("managementResolutionStatus");
        oldDiagnosis.putArray("managementPrograms");
        assertEquals(1, jdbc.update("update RHN_INT_IDEMP_RECORD set JSON_RESP=? where CD_IDEMP_KEY=?",
                receipt.toString(), command));
        var replay = save(encounter, true, command).path("diagnoses").get(0);
        assertEquals("I10", replay.path("code").asString());
        assertEquals("UNCONFIRMED", replay.path("managementResolutionStatus").asString());
        assertTrue(replay.path("managementPrograms").isNull());
    }

    private tools.jackson.databind.JsonNode save(String encounter, boolean catalog, String command) throws Exception {
        return json(mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounter).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"commandCode":"%s","chiefComplaint":"头晕","systolic":120,"diastolic":80,"diagnoses":[{%s
                  "diagnosisDomain":"WESTERN_MEDICINE","code":"I10","display":"高血压","type":"PRIMARY"}]}
                """.formatted(command, catalog ? "\"conceptId\":\"362387869795011\"," : "")))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
}
