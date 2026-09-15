package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.ItemAttributeValue;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ItemAttributeValueRepository extends JpaRepository<ItemAttributeValue, Long> {
    @Query("""
            select value from ItemAttributeValue value
            where value.attributeSubjectId in :subjectIds
              and value.status = 'ACTIVE'
              and value.validFrom <= :businessDate
              and (value.validTo is null or value.validTo >= :businessDate)
            """)
    List<ItemAttributeValue> findCurrent(@Param("subjectIds") Collection<Long> subjectIds,
                                         @Param("businessDate") LocalDate businessDate);

    List<ItemAttributeValue> findByTenantIdAndAttributeSubjectIdAndAttributeDefinitionIdAndScopeCodeAndStatusOrderByValidFromDesc(
            Long tenantId, Long attributeSubjectId, Long attributeDefinitionId, String scopeCode, String status);

    Optional<ItemAttributeValue> findByIdAndTenantIdAndAttributeSubjectId(
            Long id, Long tenantId, Long attributeSubjectId);

    boolean existsByAttributeDefinitionId(Long attributeDefinitionId);
}
