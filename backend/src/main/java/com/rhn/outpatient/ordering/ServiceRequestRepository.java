package com.rhn.outpatient.ordering;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

interface ServiceRequestRepository extends JpaRepository<ServiceRequest, Long> {
    Optional<ServiceRequest> findByIdAndTenantId(Long id, Long tenantId);
    Optional<ServiceRequest> findByTenantIdAndRequestNo(Long tenantId, String requestNo);
    List<ServiceRequest> findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(Long tenantId, Long encounterId);
}
