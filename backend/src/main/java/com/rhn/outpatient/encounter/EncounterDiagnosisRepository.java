package com.rhn.outpatient.encounter;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

interface EncounterDiagnosisRepository extends JpaRepository<EncounterDiagnosis, Long> {
    List<EncounterDiagnosis> findByTenantIdAndEncounterIdOrderByRecordedAt(Long tenantId, Long encounterId);
    void deleteByTenantIdAndEncounterId(Long tenantId, Long encounterId);
}

