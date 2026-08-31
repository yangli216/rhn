package com.rhn.outpatient.encounter;

import com.rhn.healthcore.api.EncounterDiagnosisDirectory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class JpaEncounterDiagnosisDirectory implements EncounterDiagnosisDirectory {
    private final EncounterDiagnosisRepository diagnoses;
    private final EncounterDiagnosisRevisionRepository revisions;

    public JpaEncounterDiagnosisDirectory(EncounterDiagnosisRepository diagnoses,
                                          EncounterDiagnosisRevisionRepository revisions) {
        this.diagnoses = diagnoses;
        this.revisions = revisions;
    }

    @Override
    @Transactional(readOnly = true)
    public List<DiagnosisSnapshot> findActiveDiagnoses(Long tenantId, Long encounterId, String diagnosisStage) {
        return diagnoses.findByTenantIdAndEncounterIdAndDiagnosisStageAndDiagnosisStatusOrderByRecordedAt(
                        tenantId, encounterId, diagnosisStage, "ACTIVE").stream()
                .map(value -> new DiagnosisSnapshot(value.id(), value.encounterId(), value.diagnosisStage(),
                        value.code(), value.display(), value.diagnosisType().name(),
                        value.verificationStatus(), value.diagnosisStatus()))
                .toList();
    }

    @Override
    @Transactional
    public List<DiagnosisSnapshot> replaceActiveDiagnoses(ReplaceDiagnosesCommand command) {
        List<EncounterDiagnosis> existing = diagnoses
                .findByTenantIdAndEncounterIdAndDiagnosisStageOrderByRecordedAt(
                        command.tenantId(), command.encounterId(), command.diagnosisStage());
        Map<String, EncounterDiagnosis> byCode = existing.stream().collect(Collectors.toMap(
                EncounterDiagnosis::code, Function.identity(), (left, right) -> left, LinkedHashMap::new));
        Set<String> incomingCodes = new LinkedHashSet<>();
        List<EncounterDiagnosisRevision> changes = new java.util.ArrayList<>();
        for (DiagnosisInput input : command.diagnoses()) {
            incomingCodes.add(input.code());
            EncounterDiagnosis diagnosis = byCode.get(input.code());
            EncounterDiagnosis.DiagnosisType type = EncounterDiagnosis.DiagnosisType.valueOf(input.diagnosisType());
            String changeType;
            if (diagnosis == null) {
                diagnosis = diagnoses.save(new EncounterDiagnosis(command.tenantId(), command.encounterId(),
                        command.diagnosisStage(), input.code(), input.display(), type,
                        input.verificationStatus(), command.userId()));
                changeType = "ADDED";
            } else if ("ACTIVE".equals(diagnosis.diagnosisStatus())
                    && input.display().equals(diagnosis.display()) && type == diagnosis.diagnosisType()
                    && input.verificationStatus().equals(diagnosis.verificationStatus())) {
                continue;
            } else {
                changeType = "ACTIVE".equals(diagnosis.diagnosisStatus()) ? "UPDATED" : "RESTORED";
                diagnosis.revise(input.display(), type, input.verificationStatus(), command.userId());
            }
            changes.add(new EncounterDiagnosisRevision(diagnosis, changeType, command.changeReason(),
                    command.practitionerId(), command.userId()));
        }
        for (EncounterDiagnosis diagnosis : existing) {
            if ("ACTIVE".equals(diagnosis.diagnosisStatus()) && !incomingCodes.contains(diagnosis.code())) {
                diagnosis.exclude(command.userId());
                changes.add(new EncounterDiagnosisRevision(diagnosis, "EXCLUDED", command.changeReason(),
                        command.practitionerId(), command.userId()));
            }
        }
        diagnoses.flush();
        revisions.saveAll(changes);
        revisions.flush();
        return diagnoses.findByTenantIdAndEncounterIdAndDiagnosisStageAndDiagnosisStatusOrderByRecordedAt(
                        command.tenantId(), command.encounterId(), command.diagnosisStage(), "ACTIVE").stream()
                .map(value -> new DiagnosisSnapshot(value.id(), value.encounterId(), value.diagnosisStage(),
                        value.code(), value.display(), value.diagnosisType().name(),
                        value.verificationStatus(), value.diagnosisStatus()))
                .toList();
    }
}
