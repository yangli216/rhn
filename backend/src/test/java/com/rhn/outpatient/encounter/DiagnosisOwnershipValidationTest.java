package com.rhn.outpatient.encounter;

import com.rhn.healthcore.api.EncounterDiagnosisDirectory;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DiagnosisOwnershipValidationTest {
    private final EncounterDiagnosisRepository diagnoses = mock(EncounterDiagnosisRepository.class);
    private final EncounterDiagnosisRevisionRepository revisions = mock(EncounterDiagnosisRevisionRepository.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final JpaEncounterDiagnosisDirectory directory = new JpaEncounterDiagnosisDirectory(diagnoses, revisions, jdbc,
            mock(com.rhn.platform.terminology.api.TerminologyDirectory.class), mock(com.rhn.shared.json.JsonCodec.class));

    static Stream<org.junit.jupiter.params.provider.Arguments> incompleteOwnership() {
        return Stream.of("ID_PAT", "ID_ORG", "ID_DEPT").flatMap(field ->
                Stream.of(null, 0L, -1L).map(value -> org.junit.jupiter.params.provider.Arguments.of(field, value)));
    }

    @ParameterizedTest @MethodSource("incompleteOwnership")
    void missingOrInvalidEncounterOwnershipCannotWriteDiagnosesOrRevisions(String field, Long value) {
        var row = new HashMap<String, Object>(Map.of("ID_PAT", 21L, "ID_ORG", 22L, "ID_DEPT", 23L));
        row.put(field, value);
        when(jdbc.queryForList(anyString(), eq(11L), eq(12L))).thenReturn(List.of(row));
        var error = assertThrows(BusinessException.class, () -> directory.replaceActiveDiagnoses(command(11L, 12L)));
        assertEquals("DIAGNOSIS_OWNERSHIP_UNCONFIRMED", error.code());
        verifyNoInteractions(diagnoses, revisions);
    }

    @Test void missingEncounterCannotFallBackToIdentityOne() {
        when(jdbc.queryForList(anyString(), eq(11L), eq(12L))).thenReturn(List.of());
        var error = assertThrows(BusinessException.class, () -> directory.replaceActiveDiagnoses(command(11L, 12L)));
        assertEquals("ENCOUNTER_NOT_FOUND", error.code());
        verifyNoInteractions(diagnoses, revisions);
    }

    @Test void missingCommandIdentityFailsBeforeAnyQueryOrMutation() {
        for (var command : List.of(command(null, 12L), command(11L, null), command(0L, 12L), command(11L, -1L))) {
            var error = assertThrows(BusinessException.class, () -> directory.replaceActiveDiagnoses(command));
            assertEquals("DIAGNOSIS_ENCOUNTER_REQUIRED", error.code());
        }
        verifyNoInteractions(jdbc, diagnoses, revisions);
    }

    @Test void directEntityConstructionAlsoRequiresAllFiveRealIdentityFields() {
        for (int missing = 0; missing < 5; missing++) {
            for (Long invalid : new Long[]{null, 0L, -1L}) {
                Long[] ids = {11L, 21L, 22L, 23L, 12L};
                ids[missing] = invalid;
                var error = assertThrows(BusinessException.class, () -> new EncounterDiagnosis(
                        ids[0], ids[1], ids[2], ids[3], ids[4], "ADMISSION", null, null, null,
                        "WESTERN_MEDICINE", null, "I10", "高血压", EncounterDiagnosis.DiagnosisType.PRIMARY,
                        "PROVISIONAL", null, 1, 31L));
                assertEquals("DIAGNOSIS_OWNERSHIP_UNCONFIRMED", error.code());
            }
        }
    }

    private EncounterDiagnosisDirectory.ReplaceDiagnosesCommand command(Long tenant, Long encounter) {
        return new EncounterDiagnosisDirectory.ReplaceDiagnosesCommand(tenant, encounter, "ADMISSION",
                List.of(new EncounterDiagnosisDirectory.DiagnosisInput("I10", "高血压", "PRIMARY", "PROVISIONAL")),
                30L, 31L, "诊断归属核查");
    }
}
