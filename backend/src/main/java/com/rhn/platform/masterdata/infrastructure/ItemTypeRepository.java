package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.ItemType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ItemTypeRepository extends JpaRepository<ItemType, Long> {
    List<ItemType> findBySubjectTypeAndStatusOrderBySortOrderAscNameAsc(String subjectType, String status);
    List<ItemType> findByStatusOrderBySubjectTypeAscSortOrderAscNameAsc(String status);

    @Query("""
            select value from ItemType value
            where value.status = 'ACTIVE'
              and (value.scopeType = 'PLATFORM' or value.tenantId = :tenantId)
            order by value.subjectType, value.sortOrder, value.name
            """)
    List<ItemType> findVisibleActive(@Param("tenantId") Long tenantId);
}
