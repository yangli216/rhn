package com.rhn;

import com.rhn.healthcore.api.EncounterDiagnosisDirectory;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DiagnosisOwnershipPersistenceTest extends RhnIntegrationTestSupport {
    @Autowired EncounterDiagnosisDirectory directory;
    @Autowired JdbcTemplate jdbc;

    @Test void nonexistentEncounterCannotProduceDiagnosisOrRevisionEvenWithOtherwiseValidInput() {
        long missing = com.rhn.shared.id.GlobalIds.next();
        assertEquals(0, count("RHN_VIS_ENC", missing));
        var error = assertThrows(BusinessException.class, () -> directory.replaceActiveDiagnoses(
                command(Long.valueOf(TENANT), missing, true)));
        assertEquals("ENCOUNTER_NOT_FOUND", error.code());
        assertEquals(0, count("RHN_VIS_ENC_DIAG", missing));
        assertEquals(0, count("RHN_VIS_ENC_DIAG_REV", missing));
    }

    @Test void anotherTenantCannotReplaceOrExcludeTheRealEncountersDiagnoses() throws Exception {
        long encounter = encounter();
        var original = directory.replaceActiveDiagnoses(command(Long.valueOf(TENANT), encounter, true));
        for (boolean populated : new boolean[]{true, false}) {
            var error = assertThrows(BusinessException.class, () -> directory.replaceActiveDiagnoses(
                    command(com.rhn.shared.id.GlobalIds.next(), encounter, populated)));
            assertEquals("ENCOUNTER_NOT_FOUND", error.code());
        }
        assertEquals(original, directory.findActiveDiagnoses(Long.valueOf(TENANT), encounter, "ADMISSION"));
        assertEquals(1, count("RHN_VIS_ENC_DIAG", encounter));
        assertEquals(1, count("RHN_VIS_ENC_DIAG_REV", encounter));
    }

    @Test void diagnosisOwnershipComesFromActualEncounterAndSurvivesExclusionAndRestoration() throws Exception {
        long encounter = encounter();
        var original = directory.replaceActiveDiagnoses(command(Long.valueOf(TENANT), encounter, true));
        assertEquals("PROVISIONAL", original.getFirst().verificationStatus());
        assertOwnership(encounter);
        assertTrue(directory.replaceActiveDiagnoses(command(Long.valueOf(TENANT), encounter, false)).isEmpty());
        var restored = directory.replaceActiveDiagnoses(command(Long.valueOf(TENANT), encounter, true));
        assertEquals(original.getFirst().id(), restored.getFirst().id());
        assertEquals(1, count("RHN_VIS_ENC_DIAG", encounter));
        assertEquals(3, count("RHN_VIS_ENC_DIAG_REV", encounter));
        assertEquals(List.of("ADDED", "EXCLUDED", "RESTORED"), jdbc.queryForList(
                "select SD_CHG_TYPE from RHN_VIS_ENC_DIAG_REV where ID_ENC=? order by CD_BIZ_VER_NO",
                String.class, encounter));
        assertOwnership(encounter);
    }

    private void assertOwnership(long encounter) {
        var actual = jdbc.queryForMap("select ID_TNT,ID_PAT,ID_ORG,ID_DEPT,ID_ENC from RHN_VIS_ENC where ID_ENC=?", encounter);
        var diagnosis = jdbc.queryForMap("select ID_TNT,ID_PAT,ID_ORG,ID_DEPT,ID_ENC from RHN_VIS_ENC_DIAG where ID_ENC=?", encounter);
        assertEquals(actual, diagnosis);
        for (Object id : diagnosis.values()) assertNotEquals(1L, ((Number) id).longValue());
    }

    private int count(String table, long encounter) {
        return jdbc.queryForObject("select count(*) from " + table + " where ID_ENC=?", Integer.class, encounter);
    }

    private EncounterDiagnosisDirectory.ReplaceDiagnosesCommand command(Long tenant, Long encounter, boolean populated) {
        var actor = jdbc.queryForMap("select ID_PRACT,ID_USER from RHN_SYS_USER_ACCT where ID_TNT=? and CD_USRNM=?",
                Long.valueOf(TENANT), "doctor");
        return new EncounterDiagnosisDirectory.ReplaceDiagnosesCommand(tenant, encounter, "ADMISSION",
                populated ? List.of(new EncounterDiagnosisDirectory.DiagnosisInput("I10", "高血压", "PRIMARY", "PROVISIONAL")) : List.of(),
                ((Number) actor.get("ID_PRACT")).longValue(), ((Number) actor.get("ID_USER")).longValue(), "诊断归属核查");
    }

    private long encounter() throws Exception {
        var resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"fullName":"诊断归属核查","identifiers":[{"system":"9","value":"%s","useType":"SECONDARY"}],"gender":"FEMALE","birthDate":"1970-01-01"}
                        """.formatted(UUID.randomUUID())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        var encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"residentId":"%s","organizationId":"%s","departmentId":"%s","idempotencyCode":"%s"}
                        """.formatted(resident.path("id").asString(), ORGANIZATION, DEPARTMENT, UUID.randomUUID())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return Long.parseLong(encounter.path("id").asString());
    }
}
