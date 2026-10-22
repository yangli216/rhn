package com.rhn.outpatient.ordering;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

interface ServiceRequestSiteRepository extends JpaRepository<ServiceRequestSite, Long> {
    List<ServiceRequestSite> findByTenantIdAndRequestIdOrderByLineNoAsc(Long tenantId, Long requestId);
    List<ServiceRequestSite> findByTenantIdAndRequestIdInOrderByRequestIdAscLineNoAsc(Long tenantId, Collection<Long> requestIds);
}
