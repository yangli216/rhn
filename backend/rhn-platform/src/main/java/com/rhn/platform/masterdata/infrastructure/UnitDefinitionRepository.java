package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.UnitDefinition;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.Set;

public interface UnitDefinitionRepository extends JpaRepository<UnitDefinition, Long> {
    List<UnitDefinition> findByTenantIdOrderByDimensionAscNameAsc(Long tenantId);
    Optional<UnitDefinition> findByIdAndTenantId(Long id, Long tenantId);
    Optional<UnitDefinition> findByTenantIdAndCode(Long tenantId, String code);
    List<UnitDefinition> findByTenantIdAndCodeIn(Long tenantId, Set<String> codes);
    boolean existsByTenantIdAndCode(Long tenantId, String code);
}
