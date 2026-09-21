package com.rhn.outpatient.encounter;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

interface EncounterDiagnosisRepository extends JpaRepository<EncounterDiagnosis, Long> {
    List<EncounterDiagnosis> findByTenantIdAndEncounterIdAndDiagnosisStageOrderBySortOrderAscRecordedAtAsc(
            Long tenantId, Long encounterId, String diagnosisStage);
    List<EncounterDiagnosis> findByTenantIdAndEncounterIdAndDiagnosisStageAndDiagnosisStatusOrderBySortOrderAscRecordedAtAsc(
            Long tenantId, Long encounterId, String diagnosisStage, String diagnosisStatus);
    List<EncounterDiagnosis> findByTenantIdAndEncounterIdInAndDiagnosisStageAndDiagnosisStatusOrderBySortOrderAscRecordedAtAsc(
            Long tenantId, java.util.Collection<Long> encounterIds, String diagnosisStage, String diagnosisStatus);
}
