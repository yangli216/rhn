package com.rhn.platform.configuration.infrastructure;

import com.rhn.platform.configuration.domain.ParameterValue;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ParameterValueRepository extends JpaRepository<ParameterValue, Long> {
    Optional<ParameterValue> findByDefinitionIdAndScopeCode(Long definitionId, String scopeCode);

    Optional<ParameterValue> findByIdAndDefinitionId(Long id, Long definitionId);

    @Query("""
            select value from ParameterValue value
             where value.definitionId = :definitionId
               and (value.tenantId is null or value.tenantId = :tenantId)
             order by value.updatedAt desc
            """)
    List<ParameterValue> findVisible(@Param("definitionId") Long definitionId,
                                     @Param("tenantId") Long tenantId);

    long countByDefinitionId(Long definitionId);

    @Query("""
            select value from ParameterValue value
             where value.definitionId = :definitionId
               and value.active = true
               and (value.tenantId is null or value.tenantId = :tenantId)
            """)
    List<ParameterValue> findResolvable(@Param("definitionId") Long definitionId,
                                        @Param("tenantId") Long tenantId);
}
