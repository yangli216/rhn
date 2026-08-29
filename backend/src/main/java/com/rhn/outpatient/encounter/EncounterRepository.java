package com.rhn.outpatient.encounter;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.Collection;

interface EncounterRepository extends JpaRepository<Encounter, Long> {
    Optional<Encounter> findByIdAndTenantId(Long id, Long tenantId);
    Optional<Encounter> findFirstByTenantIdAndResidentIdAndOrganizationIdAndDepartmentIdAndStatusIn(
            Long tenantId, Long residentId, Long organizationId, Long departmentId,
            Collection<EncounterStatus> statuses);
    List<Encounter> findTop20ByTenantIdAndResidentIdOrderByRegisteredAtDesc(Long tenantId, Long residentId);
    List<Encounter> findTop20ByTenantIdAndResidentIdAndOrganizationIdAndDepartmentIdOrderByRegisteredAtDesc(
            Long tenantId, Long residentId, Long organizationId, Long departmentId);
}
