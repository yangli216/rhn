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
    private final com.rhn.platform.terminology.api.TerminologyDirectory terminology;
    private final com.rhn.shared.json.JsonCodec json;

    public JpaEncounterDiagnosisDirectory(EncounterDiagnosisRepository diagnoses,
                                          EncounterDiagnosisRevisionRepository revisions,
                                          org.springframework.jdbc.core.JdbcTemplate jdbcTemplate,
                                          com.rhn.platform.terminology.api.TerminologyDirectory terminology,
                                          com.rhn.shared.json.JsonCodec json) {
        this.diagnoses = diagnoses;
        this.revisions = revisions;
        this.jdbcTemplate = jdbcTemplate;
        this.terminology = terminology;
        this.json = json;
    }

    @Override
    @Transactional(readOnly = true)
    public List<DiagnosisSnapshot> findActiveDiagnoses(Long tenantId, Long encounterId, String diagnosisStage) {
        return diagnoses.findByTenantIdAndEncounterIdAndDiagnosisStageAndDiagnosisStatusOrderBySortOrderAscRecordedAtAsc(
                        tenantId, encounterId, diagnosisStage, "ACTIVE").stream()
                .map(value -> new DiagnosisSnapshot(value.id(), value.encounterId(), value.diagnosisStage(),
                        value.code(), value.display(), value.diagnosisType().name(),
                        value.verificationStatus(), value.diagnosisStatus(), value.conceptId(), value.diagnosisDomain()))
                .toList();
    }

    @Override
    @Transactional
    public List<DiagnosisSnapshot> replaceActiveDiagnoses(ReplaceDiagnosesCommand command) {
        if (command.tenantId() == null || command.tenantId() <= 0
                || command.encounterId() == null || command.encounterId() <= 0) {
            throw new com.rhn.shared.api.BusinessException("DIAGNOSIS_ENCOUNTER_REQUIRED",
                    "保存诊断必须指定真实租户与就诊", org.springframework.http.HttpStatus.BAD_REQUEST);
        }
        // Lock the actual encounter while copying its ownership into new diagnosis facts.
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "select ID_PAT, ID_ORG, ID_DEPT from RHN_VIS_ENC where ID_TNT = ? and ID_ENC = ? for update",
                command.tenantId(), command.encounterId());
        if (rows.isEmpty()) {
            throw new com.rhn.shared.api.BusinessException("ENCOUNTER_NOT_FOUND",
                    "未找到诊断关联的就诊", org.springframework.http.HttpStatus.NOT_FOUND);
        }
        Map<String, Object> row = rows.get(0);
        Long patId = nullableId(row.get("ID_PAT"));
        Long orgId = nullableId(row.get("ID_ORG"));
        Long deptId = nullableId(row.get("ID_DEPT"));
        EncounterDiagnosis.requireOwnership(command.tenantId(), patId, orgId, deptId, command.encounterId());
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
            DiagnosisTerminology resolved;
            if (diagnosis != null && input.conceptId() == null && input.diagnosisDomain() == null) {
                // Older clients omit terminology identity; do not erase a previously captured snapshot.
                resolved = new DiagnosisTerminology(diagnosis.conceptId(), diagnosis.codeSystemCodeSnapshot(),
                        diagnosis.codeSystemVersionSnapshot(), diagnosis.diagnosisDomain(), diagnosis.code(),
                        input.display(), diagnosis.managementSnapshotJson());
            } else {
                resolved = DiagnosisTerminology.resolve(command.tenantId(), input.conceptId(), input.diagnosisDomain(),
                        input.code(), input.display(), terminology, json);
                if (!input.code().equalsIgnoreCase(resolved.code())) {
                    throw new com.rhn.shared.api.BusinessException("DIAGNOSIS_CODE_MISMATCH",
                            "诊断编码与所选疾病术语不一致", org.springframework.http.HttpStatus.BAD_REQUEST);
                }
            }
            String changeType;
            if (diagnosis == null) {
                diagnosis = diagnoses.save(new EncounterDiagnosis(command.tenantId(), patId, orgId, deptId,
                        command.encounterId(),
                        command.diagnosisStage(), resolved.conceptId(), resolved.systemCode(), resolved.systemVersion(), resolved.diagnosisDomain(), null,
                        input.code(), resolved.display(), type, input.verificationStatus(), resolved.managementJson(),
                        sortOrder, command.userId()));
                changeType = "ADDED";
            } else if ("ACTIVE".equals(diagnosis.diagnosisStatus())
                    && resolved.display().equals(diagnosis.display()) && type == diagnosis.diagnosisType()
                    && java.util.Objects.equals(resolved.conceptId(), diagnosis.conceptId())
                    && java.util.Objects.equals(resolved.diagnosisDomain(), diagnosis.diagnosisDomain())
                    && java.util.Objects.equals(resolved.systemCode(), diagnosis.codeSystemCodeSnapshot())
                    && java.util.Objects.equals(resolved.systemVersion(), diagnosis.codeSystemVersionSnapshot())
                    && java.util.Objects.equals(resolved.managementJson(), diagnosis.managementSnapshotJson())
                    && input.verificationStatus().equals(diagnosis.verificationStatus())
                    && sortOrder == diagnosis.sortOrder()) {
                continue;
            } else {
                changeType = "ACTIVE".equals(diagnosis.diagnosisStatus()) ? "UPDATED" : "RESTORED";
                diagnosis.revise(resolved.conceptId(), resolved.systemCode(),
                        resolved.systemVersion(), resolved.diagnosisDomain(),
                        diagnosis.diagnosisGroupId(), resolved.display(), type, input.verificationStatus(),
                        resolved.managementJson(), sortOrder, command.userId());
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
                        value.verificationStatus(), value.diagnosisStatus(), value.conceptId(), value.diagnosisDomain()))
                .toList();
    }
    private static Long nullableId(Object value) {
        return value instanceof Number number ? number.longValue() : null;
    }

}
