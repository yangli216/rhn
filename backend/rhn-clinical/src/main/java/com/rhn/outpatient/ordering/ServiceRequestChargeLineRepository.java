package com.rhn.outpatient.ordering;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

interface ServiceRequestChargeLineRepository extends JpaRepository<ServiceRequestChargeLine, Long> {
    List<ServiceRequestChargeLine> findByTenantIdAndRequestIdOrderByLineNoAsc(Long tenantId, Long requestId);
}
