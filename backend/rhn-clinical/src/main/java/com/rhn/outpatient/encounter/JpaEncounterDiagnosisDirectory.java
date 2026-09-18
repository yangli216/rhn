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
    private final org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;

    public JpaEncounterDiagnosisDirectory(EncounterDiagnosisRepository diagnoses,
                                          EncounterDiagnosisRevisionRepository revisions,
                                          org.springframework.jdbc.core.JdbcTemplate jdbcTemplate) {
        this.diagnoses = diagnoses;
        this.revisions = revisions;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    @Transactional(readOnly = true)
    public List<DiagnosisSnapshot> findActiveDiagnoses(Long tenantId, Long encounterId, String diagnosisStage) {
        return diagnoses.findByTenantIdAndEncounterIdAndDiagnosisStageAndDiagnosisStatusOrderBySortOrderAscRecordedAtAsc(
                        tenantId, encounterId, diagnosisStage, "ACTIVE").stream()
                .map(value -> new DiagnosisSnapshot(value.id(), value.encounterId(), value.diagnosisStage(),
                        value.code(), value.display(), value.diagnosisType().name(),
                        value.verificationStatus(), value.diagnosisStatus()))
                .toList();
    }

    @Override
    @Transactional
    public List<DiagnosisSnapshot> replaceActiveDiagnoses(ReplaceDiagnosesCommand command) {
        Long patId = 1L; Long orgId = 1L; Long deptId = 1L;
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "select ID_PAT, ID_ORG, ID_DEPT from RHN_VIS_ENC where ID_TNT = ? and ID_ENC = ?",
                command.tenantId(), command.encounterId());
        if (!rows.isEmpty()) {
            Map<String, Object> r = rows.get(0);
            if (r.get("ID_PAT") != null) patId = ((Number) r.get("ID_PAT")).longValue();
            if (r.get("ID_ORG") != null) orgId = ((Number) r.get("ID_ORG")).longValue();
            if (r.get("ID_DEPT") != null) deptId = ((Number) r.get("ID_DEPT")).longValue();
        }
        List<EncounterDiagnosis> existing = diagnoses
                .findByTenantIdAndEncounterIdAndDiagnosisStageOrderBySortOrderAscRecordedAtAsc(
                        command.tenantId(), command.encounterId(), command.diagnosisStage());
        Map<String, EncounterDiagnosis> byCode = existing.stream().collect(Collectors.toMap(
                EncounterDiagnosis::code, Function.identity(), (left, right) -> left, LinkedHashMap::new));
        Set<String> incomingCodes = new LinkedHashSet<>();
        List<EncounterDiagnosisRevision> changes = new java.util.ArrayList<>();
        for (int index = 0; index < command.diagnoses().size(); index++) {
            DiagnosisInput input = command.diagnoses().get(index);
            int sortOrder = index + 1;
            incomingCodes.add(input.code());
            EncounterDiagnosis diagnosis = byCode.get(input.code());
            EncounterDiagnosis.DiagnosisType type = EncounterDiagnosis.DiagnosisType.valueOf(input.diagnosisType());
            String changeType;
            if (diagnosis == null) {
                diagnosis = diagnoses.save(new EncounterDiagnosis(command.tenantId(), patId, orgId, deptId,
                        command.encounterId(),
                        command.diagnosisStage(), null, null, null, "WESTERN_MEDICINE", null,
                        input.code(), input.display(), type, input.verificationStatus(), null,
                        sortOrder, command.userId()));
                changeType = "ADDED";
            } else if ("ACTIVE".equals(diagnosis.diagnosisStatus())
                    && input.display().equals(diagnosis.display()) && type == diagnosis.diagnosisType()
                    && input.verificationStatus().equals(diagnosis.verificationStatus())
                    && sortOrder == diagnosis.sortOrder()) {
                continue;
            } else {
                changeType = "ACTIVE".equals(diagnosis.diagnosisStatus()) ? "UPDATED" : "RESTORED";
                diagnosis.revise(diagnosis.conceptId(), diagnosis.codeSystemCodeSnapshot(),
                        diagnosis.codeSystemVersionSnapshot(), diagnosis.diagnosisDomain(),
                        diagnosis.diagnosisGroupId(), input.display(), type, input.verificationStatus(),
                        diagnosis.managementSnapshotJson(), sortOrder, command.userId());
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
        return diagnoses.findByTenantIdAndEncounterIdAndDiagnosisStageAndDiagnosisStatusOrderBySortOrderAscRecordedAtAsc(
                        command.tenantId(), command.encounterId(), command.diagnosisStage(), "ACTIVE").stream()
                .map(value -> new DiagnosisSnapshot(value.id(), value.encounterId(), value.diagnosisStage(),
                        value.code(), value.display(), value.diagnosisType().name(),
                        value.verificationStatus(), value.diagnosisStatus()))
                .toList();
    }
}
