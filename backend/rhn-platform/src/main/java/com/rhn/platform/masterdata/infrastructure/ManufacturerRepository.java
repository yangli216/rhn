package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.Manufacturer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ManufacturerRepository extends JpaRepository<Manufacturer, Long> {
    List<Manufacturer> findByTenantIdOrderByName(Long tenantId);
    List<Manufacturer> findByTenantIdAndIdIn(Long tenantId, java.util.Collection<Long> ids);
    Optional<Manufacturer> findByIdAndTenantId(Long id, Long tenantId);
    boolean existsByTenantIdAndCode(Long tenantId, String code);
    boolean existsByTenantIdAndCodeAndIdNot(Long tenantId, String code, Long id);
}
