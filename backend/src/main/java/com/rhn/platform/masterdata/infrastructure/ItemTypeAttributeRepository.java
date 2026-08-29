package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.ItemTypeAttribute;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ItemTypeAttributeRepository extends JpaRepository<ItemTypeAttribute, Long> {
    List<ItemTypeAttribute> findByItemTypeIdInAndStatus(Collection<Long> itemTypeIds, String status);
    List<ItemTypeAttribute> findByAttributeDefinitionIdIn(Collection<Long> definitionIds);
    Optional<ItemTypeAttribute> findByIdAndAttributeDefinitionId(Long id, Long definitionId);
    Optional<ItemTypeAttribute> findByItemTypeIdAndAttributeDefinitionId(Long itemTypeId, Long definitionId);
    @Query("""
            select (count(assignment) > 0)
              from ItemTypeAttribute assignment, ItemAttributeDefinition definition
             where assignment.attributeDefinitionId = definition.id
               and assignment.itemTypeId = :itemTypeId
               and assignment.groupSortOrder = :groupSortOrder
               and assignment.attributeSortOrder = :attributeSortOrder
               and assignment.id <> :ignoredId
               and definition.tenantId = :tenantId
            """)
    boolean existsTenantOrderCollision(@Param("tenantId") Long tenantId,
                                       @Param("itemTypeId") Long itemTypeId,
                                       @Param("groupSortOrder") int groupSortOrder,
                                       @Param("attributeSortOrder") int attributeSortOrder,
                                       @Param("ignoredId") Long ignoredId);
}
