package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.UnitConversion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UnitConversionRepository extends JpaRepository<UnitConversion, Long> {
    List<UnitConversion> findByTenantIdOrderByScopeCodeAscValidFromDesc(Long tenantId);
    Optional<UnitConversion> findByIdAndTenantId(Long id, Long tenantId);
}
