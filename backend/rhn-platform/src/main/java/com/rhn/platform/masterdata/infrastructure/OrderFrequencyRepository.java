package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.OrderFrequency;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OrderFrequencyRepository extends JpaRepository<OrderFrequency, Long> {
    List<OrderFrequency> findByTenantIdOrderBySortOrderAscNameAsc(Long tenantId);
    Optional<OrderFrequency> findByIdAndTenantId(Long id, Long tenantId);
    Optional<OrderFrequency> findByTenantIdAndCodeIgnoreCase(Long tenantId, String code);
    boolean existsByTenantIdAndCodeIgnoreCase(Long tenantId, String code);
}
