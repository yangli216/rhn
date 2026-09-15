package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.ItemAttributeOverride;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ItemAttributeOverrideRepository extends JpaRepository<ItemAttributeOverride, Long> {
    @Query("""
            select value from ItemAttributeOverride value
            where value.tenantId = :tenantId
              and value.attributeSubjectId = :subjectId
              and value.status = 'ACTIVE'
              and value.validFrom <= :businessDate
              and (value.validTo is null or value.validTo >= :businessDate)
            """)
    List<ItemAttributeOverride> findCurrent(@Param("tenantId") Long tenantId,
                                            @Param("subjectId") Long subjectId,
                                            @Param("businessDate") LocalDate businessDate);

    List<ItemAttributeOverride> findByTenantIdAndAttributeSubjectIdAndAttributeDefinitionIdAndScopeKeyAndStatusOrderByValidFromDesc(
            Long tenantId, Long attributeSubjectId, Long attributeDefinitionId, String scopeKey, String status);

    Optional<ItemAttributeOverride> findByIdAndTenantIdAndAttributeSubjectId(
            Long id, Long tenantId, Long attributeSubjectId);

    boolean existsByAttributeDefinitionId(Long attributeDefinitionId);
}
