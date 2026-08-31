package com.rhn.outpatient.ordering;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

interface MedicationRequestRepository extends JpaRepository<MedicationRequest, Long> {
    @Query("select request from MedicationRequest request where request.id = :id and request.tenantId = :tenantId "
            + "and request.requestKind = 'MEDICATION'")
    Optional<MedicationRequest> findByIdAndTenantId(Long id, Long tenantId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select request from MedicationRequest request where request.id = :id and request.tenantId = :tenantId "
            + "and request.requestKind = 'MEDICATION'")
    Optional<MedicationRequest> findLockedByIdAndTenantId(Long id, Long tenantId);
    @Query("select request from MedicationRequest request where request.tenantId = :tenantId "
            + "and request.encounterId = :encounterId and request.requestKind = 'MEDICATION' "
            + "order by request.authoredAt desc")
    List<MedicationRequest> findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(Long tenantId, Long encounterId);
    @Query("select request from MedicationRequest request where request.tenantId = :tenantId "
            + "and request.requestGroupId = :requestGroupId and request.requestKind = 'MEDICATION' "
            + "order by request.authoredAt")
    List<MedicationRequest> findByTenantIdAndRequestGroupIdOrderByAuthoredAt(Long tenantId, Long requestGroupId);
    @Query("select request from MedicationRequest request where request.tenantId = :tenantId "
            + "and request.performerOrganizationId = :performerOrganizationId and request.status = :status "
            + "and request.requestKind = 'MEDICATION' order by request.authoredAt")
    List<MedicationRequest> findByTenantIdAndPerformerOrganizationIdAndStatusOrderByAuthoredAt(
            Long tenantId, Long performerOrganizationId, String status);
    @Query("select request from MedicationRequest request where request.tenantId = :tenantId "
            + "and request.performerOrganizationId = :organizationId "
            + "and request.performerDepartmentId = :departmentId and request.status = 'ACTIVE' "
            + "and request.requestKind = 'MEDICATION' order by request.authoredAt")
    List<MedicationRequest> findActiveForExecution(Long tenantId, Long organizationId, Long departmentId);
}
