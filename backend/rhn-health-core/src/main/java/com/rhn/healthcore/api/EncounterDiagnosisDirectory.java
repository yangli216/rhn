package com.rhn.healthcore.api;

import java.util.List;

/** Public read contract for encounter-scoped structured diagnosis facts shared by all care settings. */
public interface EncounterDiagnosisDirectory {
    List<DiagnosisSnapshot> findActiveDiagnoses(Long tenantId, Long encounterId, String diagnosisStage);

    default List<DiagnosisSnapshot> findActivePrimaryDiagnoses(
            Long tenantId, Long encounterId, String diagnosisStage) {
        return findActiveDiagnoses(tenantId, encounterId, diagnosisStage).stream()
                .filter(value -> "PRIMARY".equals(value.diagnosisType()))
                .toList();
    }

    List<DiagnosisSnapshot> replaceActiveDiagnoses(ReplaceDiagnosesCommand command);

    record ReplaceDiagnosesCommand(
            Long tenantId, Long encounterId, String diagnosisStage, List<DiagnosisInput> diagnoses,
            Long practitionerId, Long userId, String changeReason) {
        public ReplaceDiagnosesCommand {
            diagnoses = List.copyOf(diagnoses);
        }
    }

    record DiagnosisInput(String code, String display, String diagnosisType, String verificationStatus,
                          @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) Long conceptId,
                          @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) String diagnosisDomain) {
        public DiagnosisInput(String code, String display, String diagnosisType, String verificationStatus) {
            this(code, display, diagnosisType, verificationStatus, null, null);
        }
        public DiagnosisInput(String code, String display, String diagnosisType) {
            this(code, display, diagnosisType, "CONFIRMED");
        }
    }

    record DiagnosisSnapshot(
            Long id, Long encounterId, String diagnosisStage, String code, String display, String diagnosisType,
            String verificationStatus, String diagnosisStatus, Long conceptId, String diagnosisDomain) {
        public DiagnosisSnapshot(Long id, Long encounterId, String diagnosisStage, String code, String display,
                                 String diagnosisType, String verificationStatus, String diagnosisStatus) {
            this(id, encounterId, diagnosisStage, code, display, diagnosisType, verificationStatus, diagnosisStatus, null, null);
        }
    }
}
