package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.ServiceLocation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ServiceLocationRepository extends JpaRepository<ServiceLocation, Long> {
    Optional<ServiceLocation> findByIdAndTenantId(Long id, Long tenantId);
    List<ServiceLocation> findByTenantIdAndIdIn(Long tenantId, java.util.Collection<Long> ids);
    List<ServiceLocation> findByTenantIdAndOrganizationIdOrderBySortOrderAscCodeAsc(
            Long tenantId, Long organizationId);
}
