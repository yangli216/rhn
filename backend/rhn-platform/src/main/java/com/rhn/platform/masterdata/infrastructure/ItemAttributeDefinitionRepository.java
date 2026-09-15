package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.ItemAttributeDefinition;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ItemAttributeDefinitionRepository extends JpaRepository<ItemAttributeDefinition, Long> {
    @Query("""
            select value from ItemAttributeDefinition value
            where value.scopeType = 'PLATFORM' or value.tenantId = :tenantId
            order by value.scopeType, value.code
            """)
    List<ItemAttributeDefinition> findVisible(@Param("tenantId") Long tenantId);

    Optional<ItemAttributeDefinition> findByIdAndTenantId(Long id, Long tenantId);
    Optional<ItemAttributeDefinition> findByScopeCodeAndCode(String scopeCode, String code);
}
