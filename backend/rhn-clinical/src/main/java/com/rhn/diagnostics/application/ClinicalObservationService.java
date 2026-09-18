package com.rhn.diagnostics.application;

import com.rhn.diagnostics.domain.Observation;
import com.rhn.diagnostics.infrastructure.ObservationRepository;
import com.rhn.healthcore.api.ClinicalObservationDirectory;
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
        Long orgId = 1L;
        Long deptId = 1L;
        if (command.encounterId() != null) {
            java.util.List<java.util.Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "select ID_ORG, ID_DEPT from RHN_VIS_ENC where ID_TNT = ? and ID_ENC = ?",
                    command.tenantId(), command.encounterId());
            if (!rows.isEmpty()) {
                java.util.Map<String, Object> r = rows.get(0);
                if (r.get("ID_ORG") != null) orgId = ((Number) r.get("ID_ORG")).longValue();
                if (r.get("ID_DEPT") != null) deptId = ((Number) r.get("ID_DEPT")).longValue();
            }
        }
        return new Observation(command.tenantId(), command.residentId(), command.encounterId(),
                orgId, deptId,
                LOINC_URI, null, code, name, "FINAL", "NUMBER", command.effectiveAt(), null, value,
                null, null, null, UNIT, null, null, null, performerCode, command.performerName());
    }
}
