package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.StockSite;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StockSiteRepository extends JpaRepository<StockSite, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select s from StockSite s where s.id = :id and s.tenantId = :tenantId")
    Optional<StockSite> lockByIdAndTenantId(Long id, Long tenantId);
    Optional<StockSite> findByIdAndTenantId(Long id, Long tenantId);
    List<StockSite> findByTenantIdAndIdIn(Long tenantId, java.util.Set<Long> ids);
    Optional<StockSite> findByTenantIdAndOrganizationIdAndDepartmentId(Long tenantId, Long organizationId, Long departmentId);
    boolean existsByTenantIdAndOrganizationIdAndDepartmentId(Long tenantId, Long organizationId, Long departmentId);
    boolean existsByTenantIdAndOrganizationIdAndCode(Long tenantId, Long organizationId, String code);
    List<StockSite> findByTenantIdAndOrganizationIdOrderByCode(Long tenantId, Long organizationId);
}
