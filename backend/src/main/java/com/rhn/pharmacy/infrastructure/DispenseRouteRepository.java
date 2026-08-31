package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.DispenseRoute;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DispenseRouteRepository extends JpaRepository<DispenseRoute, Long> {
    Optional<DispenseRoute> findByIdAndTenantId(Long id, Long tenantId);
    Optional<DispenseRoute> findByTenantIdAndOrganizationIdAndCode(
            Long tenantId, Long organizationId, String code);
    List<DispenseRoute> findByTenantIdAndOrganizationIdOrderByCode(
            Long tenantId, Long organizationId);
    List<DispenseRoute> findByCareSettingAndActiveTrueOrderByTenantIdAscOrganizationIdAscCodeAsc(
            String careSetting);
}
