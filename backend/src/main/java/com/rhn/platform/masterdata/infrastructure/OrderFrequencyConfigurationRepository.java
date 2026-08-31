package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.OrderFrequencyConfiguration;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OrderFrequencyConfigurationRepository extends JpaRepository<OrderFrequencyConfiguration, Long> {
    List<OrderFrequencyConfiguration> findByTenantIdAndFrequencyIdOrderByDepartmentIdDescValidFromDesc(Long tenantId, Long frequencyId);
    List<OrderFrequencyConfiguration> findByTenantIdAndOrganizationIdOrderByDepartmentIdAscValidFromDesc(Long tenantId, Long organizationId);
    Optional<OrderFrequencyConfiguration> findByIdAndTenantId(Long id, Long tenantId);
}
