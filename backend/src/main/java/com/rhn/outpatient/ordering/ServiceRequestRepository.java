package com.rhn.outpatient.ordering;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

interface ServiceRequestRepository extends JpaRepository<ServiceRequest, Long> {
    @Query("select request from ServiceRequest request where request.id = :id and request.tenantId = :tenantId "
            + "and request.requestKind = 'SERVICE'")
    Optional<ServiceRequest> findByIdAndTenantId(Long id, Long tenantId);
    @Query("select request from ServiceRequest request where request.tenantId = :tenantId "
            + "and request.requestNo = :requestNo and request.requestKind = 'SERVICE'")
    Optional<ServiceRequest> findByTenantIdAndRequestNo(Long tenantId, String requestNo);
    @Query("select request from ServiceRequest request where request.tenantId = :tenantId "
            + "and request.encounterId = :encounterId and request.requestKind = 'SERVICE' "
            + "order by request.authoredAt desc")
    List<ServiceRequest> findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(Long tenantId, Long encounterId);
}
