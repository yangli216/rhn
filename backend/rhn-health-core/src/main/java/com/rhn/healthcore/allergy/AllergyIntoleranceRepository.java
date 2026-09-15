package com.rhn.healthcore.allergy;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

interface AllergyIntoleranceRepository extends JpaRepository<AllergyIntolerance, Long> {
    List<AllergyIntolerance> findByTenantIdAndResidentIdOrderByRecordedAtDesc(Long tenantId, Long residentId);
    List<AllergyIntolerance> findByTenantIdAndResidentIdAndClinicalStatusOrderByRecordedAtDesc(
            Long tenantId, Long residentId, String clinicalStatus);
    Optional<AllergyIntolerance> findByIdAndTenantId(Long id, Long tenantId);
}
