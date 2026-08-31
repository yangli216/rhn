package com.rhn.outpatient.encounter;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

interface EncounterDiagnosisRepository extends JpaRepository<EncounterDiagnosis, Long> {
    List<EncounterDiagnosis> findByTenantIdAndEncounterIdAndDiagnosisStageOrderByRecordedAt(
            Long tenantId, Long encounterId, String diagnosisStage);
    List<EncounterDiagnosis> findByTenantIdAndEncounterIdAndDiagnosisStageAndDiagnosisStatusOrderByRecordedAt(
            Long tenantId, Long encounterId, String diagnosisStage, String diagnosisStatus);
}
