package com.rhn.outpatient.ordering;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

interface MedicationRequestRepository extends JpaRepository<MedicationRequest, Long> {
    Optional<MedicationRequest> findByIdAndTenantId(Long id, Long tenantId);
    List<MedicationRequest> findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(Long tenantId, Long encounterId);
    List<MedicationRequest> findByTenantIdAndRequestGroupIdOrderByAuthoredAt(Long tenantId, Long requestGroupId);
    List<MedicationRequest> findByTenantIdAndPerformerOrganizationIdAndStatusOrderByAuthoredAt(
            Long tenantId, Long performerOrganizationId, String status);
}
