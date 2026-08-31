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

    record DiagnosisInput(String code, String display, String diagnosisType, String verificationStatus) {
        public DiagnosisInput(String code, String display, String diagnosisType) {
            this(code, display, diagnosisType, "CONFIRMED");
        }
    }

    record DiagnosisSnapshot(
            Long id, Long encounterId, String diagnosisStage, String code, String display, String diagnosisType,
            String verificationStatus, String diagnosisStatus) {
    }
}
