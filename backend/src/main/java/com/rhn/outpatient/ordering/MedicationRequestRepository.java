package com.rhn.outpatient.ordering;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

interface MedicationRequestRepository extends JpaRepository<MedicationRequest, Long> {
    @Query("select request from MedicationRequest request where request.id = :id and request.tenantId = :tenantId "
            + "and request.requestKind = 'MEDICATION'")
    Optional<MedicationRequest> findByIdAndTenantId(Long id, Long tenantId);
    @Query("select request from MedicationRequest request where request.tenantId = :tenantId "
            + "and request.encounterId = :encounterId and request.requestKind = 'MEDICATION' "
            + "order by request.authoredAt desc")
    List<MedicationRequest> findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(Long tenantId, Long encounterId);
    List<MedicationRequest> findByTenantIdAndRequestGroupIdOrderByAuthoredAt(Long tenantId, Long requestGroupId);
    List<MedicationRequest> findByTenantIdAndPerformerOrganizationIdAndStatusOrderByAuthoredAt(
            Long tenantId, Long performerOrganizationId, String status);
}
