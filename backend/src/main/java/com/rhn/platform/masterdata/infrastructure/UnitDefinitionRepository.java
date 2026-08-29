package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.UnitDefinition;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UnitDefinitionRepository extends JpaRepository<UnitDefinition, Long> {
    List<UnitDefinition> findByTenantIdOrderByDimensionAscNameAsc(Long tenantId);
    Optional<UnitDefinition> findByIdAndTenantId(Long id, Long tenantId);
    Optional<UnitDefinition> findByTenantIdAndCode(Long tenantId, String code);
    boolean existsByTenantIdAndCode(Long tenantId, String code);
}
