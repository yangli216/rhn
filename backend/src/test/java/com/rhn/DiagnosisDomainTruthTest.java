package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DiagnosisDomainTruthTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;

    @Test void missingDomainStaysUnknownInSaveReloadRevisionsAndTimeline() throws Exception {
        String encounter = encounter();
        var saved = save(encounter, "");
        assertTrue(saved.path("diagnoses").get(0).path("diagnosisDomain").isNull());
        assertNull(jdbc.queryForObject("select SD_DIAG_DOMAIN from RHN_VIS_ENC_DIAG where ID_ENC=?", String.class, Long.valueOf(encounter)));
        assertNull(jdbc.queryForObject("select SD_DIAG_DOMAIN from RHN_VIS_ENC_DIAG_REV where ID_ENC=?", String.class, Long.valueOf(encounter)));
        var reload = json(mockMvc.perform(get("/api/encounters/{id}", encounter).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertTrue(reload.path("diagnoses").get(0).path("diagnosisDomain").isNull());
        var timeline = json(mockMvc.perform(get("/api/residents/{id}/timeline", saved.path("residentId").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        boolean found = false;
        for (var event : timeline) if ("DIAGNOSIS_RECORDED".equals(event.path("eventType").asString())) {
            found = true;
            assertFalse(event.path("details").has("diagnosisDomain"));
            assertEquals("I10", event.path("details").path("code").asString());
        }
        assertTrue(found);
        var explicit = save(encounter, "\"diagnosisDomain\":\"TCM_DISEASE\",");
        assertEquals("TCM_DISEASE", explicit.path("diagnoses").get(0).path("diagnosisDomain").asString());
        assertTrue(save(encounter, "\"diagnosisDomain\":null,").path("diagnoses").get(0).path("diagnosisDomain").isNull());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({
            "362387869795011,WESTERN_MEDICINE,I10", "362387869795067,TCM_DISEASE,XK_BING",
            "362387869795079,TCM_SYNDROME,QY_LX_ZHENG"})
    void outpatientCatalogDomainIsAuthoritativeEvenWhenOmittedInRequest(String concept, String domain, String code) throws Exception {
        var saved = save(encounter(), "\"conceptId\":\"" + concept + "\",");
        assertEquals(domain, saved.path("diagnoses").get(0).path("diagnosisDomain").asString());
        assertEquals(code, saved.path("diagnoses").get(0).path("code").asString());
    }

    @Test void inpatientAdmissionAndDischargePreserveCatalogDomainAndRejectMismatchesAtomically() throws Exception {
        var admission = json(mockMvc.perform(post("/api/inpatient/admissions").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"residentId":"362387869790213","bedId":"362387869898512","admissionTypeCode":"GENERAL",
                 "admissionSourceCode":"DIRECT","admissionReason":"诊断体系核查","commandCode":"%s"}
                """.formatted(UUID.randomUUID())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String episode = admission.path("id").asString();
        long encounter = Long.parseLong(admission.path("encounterId").asString());
        for (String stage : new String[]{"admission", "discharge"}) {
            var unknown = inpatientSave(episode, stage, "", "I10", 200);
            assertTrue(unknown.path("diagnoses").get(0).path("diagnosisDomain").isNull());
            var known = inpatientSave(episode, stage, "\"conceptId\":\"362387869795067\",", "XK_BING", 200);
            assertEquals("TCM_DISEASE", known.path("diagnoses").get(0).path("diagnosisDomain").asString());
            assertEquals("362387869795067", known.path("diagnoses").get(0).path("conceptId").asString());
            var reloaded = json(mockMvc.perform(get("/api/inpatient/episodes/{id}/{stage}-diagnoses", episode, stage).with(rhnWorkContext()))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
            assertEquals(known, reloaded);
            var olderClient = inpatientSave(episode, stage, "", "XK_BING", 200);
            assertEquals("TCM_DISEASE", olderClient.path("diagnoses").get(0).path("diagnosisDomain").asString());
            assertEquals("362387869795067", olderClient.path("diagnoses").get(0).path("conceptId").asString());
            int revisions = jdbc.queryForObject("select count(*) from RHN_VIS_ENC_DIAG_REV where ID_ENC=?", Integer.class, encounter);
            var mismatch = inpatientSave(episode, stage, "\"conceptId\":\"362387869795067\",\"diagnosisDomain\":\"WESTERN_MEDICINE\",", "XK_BING", 400);
            assertEquals("DIAGNOSIS_DOMAIN_MISMATCH", mismatch.path("code").asString());
            var codeMismatch = inpatientSave(episode, stage, "\"conceptId\":\"362387869795067\",", "OTHER", 400);
            assertEquals("DIAGNOSIS_CODE_MISMATCH", codeMismatch.path("code").asString());
            assertEquals(revisions, jdbc.queryForObject("select count(*) from RHN_VIS_ENC_DIAG_REV where ID_ENC=?", Integer.class, encounter));
            assertEquals("TCM_DISEASE", jdbc.queryForObject("select SD_DIAG_DOMAIN from RHN_VIS_ENC_DIAG where ID_ENC=? and SD_DIAG_STAGE=? and SD_DIAG_STATUS='ACTIVE'", String.class, encounter, stage.toUpperCase()));
        }
    }

    @Test void optionalTerminologyDoesNotChangeLegacyIdempotencyRequestShape() {
        var input = new com.rhn.healthcore.api.EncounterDiagnosisDirectory.DiagnosisInput("I10", "高血压", "PRIMARY", "CONFIRMED");
        var serialized = objectMapper.valueToTree(input);
        assertEquals(4, serialized.size());
        assertFalse(serialized.has("conceptId"));
        assertFalse(serialized.has("diagnosisDomain"));
        var known = objectMapper.valueToTree(new com.rhn.healthcore.api.EncounterDiagnosisDirectory.DiagnosisInput(
                "XK_BING", "消渴病", "PRIMARY", "PROVISIONAL", 362387869795067L, "TCM_DISEASE"));
        assertEquals("TCM_DISEASE", known.path("diagnosisDomain").asString());
        assertEquals("362387869795067", known.path("conceptId").asString());
    }

    @Test void runtimeContractsDeclareMissingDomainAndCatalogIdentity() throws Exception {
        String document = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var schemas = json(document).path("components").path("schemas");
        assertTrue(schemas.path("DiagnosisInput").path("properties").path("codeSystem").path("type").toString().contains("null"));
        for (String name : new String[]{"DiagnosisInput", "DiagnosisResponse", "AdmissionDiagnosisRequest", "DiagnosisRequest", "AdmissionDiagnosisView", "DischargeDiagnosisView"}) {
            assertTrue(schemas.path(name).path("properties").path("diagnosisDomain").path("type").toString().contains("null"), name);
        }
        String export = System.getProperty("rhn.diagnosis-domain.openapi-export");
        if (export != null) java.nio.file.Files.writeString(java.nio.file.Path.of(export), document);
    }

    @Test void outpatientSameCodeKeepsExplicitSystemAndDomainIdentitiesSeparateThroughReloadAndRemoval() throws Exception {
        String id = encounter();
        String rows = """
                [{"code":"SAME","display":"体系甲","type":"PRIMARY","codeSystem":"SYS_A","diagnosisDomain":"WESTERN_MEDICINE"},
                 {"code":"SAME","display":"体系乙","type":"SECONDARY","codeSystem":"SYS_B","diagnosisDomain":"WESTERN_MEDICINE"},
                 {"code":"SAME","display":"中医未指定编码系","type":"SECONDARY","diagnosisDomain":"TCM_DISEASE"},
                 {"code":"SAME","display":"完全未知体系","type":"SECONDARY"}]
                """;
        var saved = saveRows(id, rows, 200).path("diagnoses");
        assertEquals(4, saved.size());
        assertEquals("SYS_A", saved.get(0).path("systemCode").asString());
        assertEquals("SYS_B", saved.get(1).path("systemCode").asString());
        assertTrue(saved.get(2).path("systemCode").isNull());
        assertTrue(saved.get(3).path("diagnosisDomain").isNull());
        for (var diagnosis : saved) {
            assertTrue(diagnosis.path("conceptId").isNull());
            assertEquals("UNCONFIRMED", diagnosis.path("managementResolutionStatus").asString());
        }
        var again = saveRows(id, rows, 200).path("diagnoses");
        for (int i = 0; i < saved.size(); i++) assertEquals(saved.get(i).path("id"), again.get(i).path("id"));
        var reduced = saveRows(id, """
                [{"code":"SAME","display":"体系乙","type":"PRIMARY","codeSystem":"SYS_B","diagnosisDomain":"WESTERN_MEDICINE"}]
                """, 200).path("diagnoses");
        assertEquals(1, reduced.size());
        assertEquals(saved.get(1).path("id"), reduced.get(0).path("id"));
        var restored = saveRows(id, rows, 200).path("diagnoses");
        for (int i = 0; i < saved.size(); i++) assertEquals(saved.get(i).path("id"), restored.get(i).path("id"));
        var reloaded = json(mockMvc.perform(get("/api/encounters/{id}", id).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(restored, reloaded.path("diagnoses"));
    }

    @Test void outpatientRejectsDuplicateIdentityAndConflictingCatalogSystemWithoutWrites() throws Exception {
        String id = encounter();
        var saved = saveRows(id, """
                [{"conceptId":"362387869795011","code":"I10","display":"高血压","type":"PRIMARY","codeSystem":"WHO.BD.CS.ICD10"}]
                """, 200).path("diagnoses");
        int revisions = jdbc.queryForObject("select count(*) from RHN_VIS_ENC_DIAG_REV where ID_ENC=?", Integer.class, Long.valueOf(id));
        var conflict = saveRows(id, """
                [{"conceptId":"362387869795011","code":"I10","display":"高血压","type":"PRIMARY","codeSystem":"OTHER"}]
                """, 400);
        assertEquals("DIAGNOSIS_SYSTEM_MISMATCH", conflict.path("code").asString());
        for (String rows : new String[]{"""
                [{"code":"same","display":"甲","type":"PRIMARY","codeSystem":"SYS"},
                 {"code":"SAME","display":"乙","type":"SECONDARY","codeSystem":"SYS"}]
                """, """
                [{"conceptId":"362387869795011","code":"I10","display":"甲","type":"PRIMARY"},
                 {"conceptId":"362387869795011","code":"OTHER","display":"乙","type":"SECONDARY"}]
                """}) {
            assertEquals("DIAGNOSIS_DUPLICATED", saveRows(id, rows, 400).path("code").asString());
        }
        var reloaded = json(mockMvc.perform(get("/api/encounters/{id}", id).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(saved, reloaded.path("diagnoses"));
        assertEquals(revisions, jdbc.queryForObject("select count(*) from RHN_VIS_ENC_DIAG_REV where ID_ENC=?", Integer.class, Long.valueOf(id)));
    }

    @Test void distinctCatalogConceptsWithSameSystemAndCodeDoNotOverwriteEachOther() throws Exception {
        String systemCode = "LOCAL.VIS.CS.IDENTITY_" + UUID.randomUUID().toString().replace("-", "").toUpperCase();
        var conceptIds = new java.util.ArrayList<String>();
        for (String version : new String[]{"2020.01", "2020.02"}) {
            var system = json(mockMvc.perform(post("/api/platform/terminology/code-systems").with(rhnWorkContext())
                    .contentType(MediaType.APPLICATION_JSON).content("""
                    {"productScope":false,"code":"%s","name":"身份核验","version":"%s","systemType":"DISEASE",
                     "sdDiagnosisDomain":"WESTERN_MEDICINE","effectiveFrom":"2020-01-01"}
                    """.formatted(systemCode, version)))
                    .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
            mockMvc.perform(post("/api/platform/terminology/code-systems/{id}/activate", system.path("id").asString())
                    .with(rhnWorkContext())).andExpect(status().isNoContent());
            var concept = json(mockMvc.perform(post("/api/platform/terminology/diseases").with(rhnWorkContext())
                    .contentType(MediaType.APPLICATION_JSON).content("""
                    {"codeSystemId":"%s","code":"SAME","display":"版本%s","sdConceptType":"DISEASE",
                     "effectiveFrom":"2020-01-01","sdStatus":"ACTIVE","aliases":[]}
                    """.formatted(system.path("id").asString(), version)))
                    .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
            conceptIds.add(concept.path("id").asString());
        }
        String rows = """
                [{"conceptId":"%s","code":"SAME","display":"版本1","type":"PRIMARY"},
                 {"conceptId":"%s","code":"SAME","display":"版本2","type":"SECONDARY"}]
                """.formatted(conceptIds.get(0), conceptIds.get(1));
        String id = encounter();
        var first = saveRows(id, rows, 200).path("diagnoses");
        var second = saveRows(id, rows, 200).path("diagnoses");
        assertEquals(2, first.size()); assertEquals(2, second.size());
        for (int i = 0; i < 2; i++) {
            assertEquals(conceptIds.get(i), second.get(i).path("conceptId").asString());
            assertEquals(first.get(i).path("id"), second.get(i).path("id"));
        }
    }

    private JsonNode saveRows(String encounter, String diagnoses, int expected) throws Exception {
        return json(mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounter).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"commandCode":"%s","chiefComplaint":"诊断身份核查","systolic":120,"diastolic":80,"diagnoses":%s}
                """.formatted(UUID.randomUUID(), diagnoses)))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString());
    }

    private JsonNode inpatientSave(String episode, String stage, String identity, String code, int expected) throws Exception {
        return json(mockMvc.perform(put("/api/inpatient/episodes/{id}/{stage}-diagnoses", episode, stage).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"expectedEpisodeRevision":0,"commandCode":"%s","diagnoses":[{%s"code":"%s","display":"诊断体系测试",
                 "diagnosisType":"PRIMARY"%s}]}
                """.formatted(UUID.randomUUID(), identity, code, stage.equals("admission") ? ",\"verificationStatus\":\"PROVISIONAL\"" : "")))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString());
    }

    private JsonNode save(String encounter, String identity) throws Exception {
        return json(mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounter).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"commandCode":"%s","chiefComplaint":"头晕","systolic":120,"diastolic":80,
                 "diagnoses":[{%s"code":"I10","display":"诊断体系测试","type":"PRIMARY"}]}
                """.formatted(UUID.randomUUID(), identity)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private String encounter() throws Exception {
        var resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                {"fullName":"诊断体系核查","identifiers":[{"system":"9","value":"%s","useType":"SECONDARY"}],"gender":"FEMALE","birthDate":"1992-03-04"}
                """.formatted(UUID.randomUUID()))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        var encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                {"residentId":"%s","organizationId":"%s","departmentId":"%s","idempotencyCode":"%s"}
                """.formatted(resident.path("id").asString(), ORGANIZATION, DEPARTMENT, UUID.randomUUID())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String id = encounter.path("id").asString();
        mockMvc.perform(verifiedEncounterStart(id)).andExpect(status().isOk());
        return id;
    }
}
