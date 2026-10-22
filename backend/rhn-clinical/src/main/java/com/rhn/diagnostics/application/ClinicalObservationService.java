package com.rhn.diagnostics.application;

import com.rhn.diagnostics.domain.Observation;
import com.rhn.diagnostics.infrastructure.ObservationRepository;
import com.rhn.healthcore.api.ClinicalObservationDirectory;
import com.rhn.shared.api.BusinessErrors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

@Service
class ClinicalObservationService implements ClinicalObservationDirectory {
    static final String LOINC_URI = "http://loinc.org";
    static final String SYSTOLIC_CODE = "8480-6";
    static final String DIASTOLIC_CODE = "8462-4";
    static final String UNIT = "mm[Hg]";

    private final ObservationRepository repository;
    private final org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;

    ClinicalObservationService(ObservationRepository repository,
                               org.springframework.jdbc.core.JdbcTemplate jdbcTemplate) {
        this.repository = repository;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    @Transactional
    public BloodPressureEvidence recordBloodPressure(BloodPressureCommand command) {
        String performerCode = command.performerPractitionerId() == null
                ? null : command.performerPractitionerId().toString();
        Observation systolic = repository.save(numeric(command, SYSTOLIC_CODE, "收缩压",
                BigDecimal.valueOf(command.systolic()), performerCode));
        Observation diastolic = repository.save(numeric(command, DIASTOLIC_CODE, "舒张压",
                BigDecimal.valueOf(command.diastolic()), performerCode));
        return new BloodPressureEvidence(systolic.id(), diastolic.id(), command.systolic(), command.diastolic(),
                UNIT, command.effectiveAt());
    }

    private Observation numeric(BloodPressureCommand command, String code, String name, BigDecimal value,
                                String performerCode) {
        if (command.encounterId() == null) {
            throw BusinessErrors.conflict("OBSERVATION_ENCOUNTER_REQUIRED", "记录血压必须关联就诊");
        }
        java.util.List<java.util.Map<String, Object>> rows = jdbcTemplate.queryForList(
                "select ID_ORG, ID_DEPT from RHN_VIS_ENC where ID_TNT = ? and ID_ENC = ?",
                command.tenantId(), command.encounterId());
        if (rows.isEmpty() || rows.get(0).get("ID_ORG") == null || rows.get(0).get("ID_DEPT") == null) {
            throw BusinessErrors.notFound("OBSERVATION_ENCOUNTER_NOT_FOUND", "未找到血压所属就诊或其机构科室");
        }
        Long orgId = ((Number) rows.get(0).get("ID_ORG")).longValue();
        Long deptId = ((Number) rows.get(0).get("ID_DEPT")).longValue();
        return new Observation(command.tenantId(), command.residentId(), command.encounterId(),
                orgId, deptId,
                LOINC_URI, null, code, name, "FINAL", "NUMBER", command.effectiveAt(), null, value,
                null, null, null, UNIT, null, null, null, performerCode, command.performerName());
    }
}
