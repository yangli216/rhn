package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.ItemAlias;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Set;

public interface ItemAliasRepository extends JpaRepository<ItemAlias, Long> {
    List<ItemAlias> findByTenantIdAndCatalogItemIdAndStatusOrderByAliasName(
            Long tenantId, Long catalogItemId, String status);

    List<ItemAlias> findByTenantIdAndCatalogItemIdOrderByAliasName(Long tenantId, Long catalogItemId);

    List<ItemAlias> findByTenantIdAndCatalogItemIdInAndStatus(
            Long tenantId, Collection<Long> catalogItemIds, String status);

    @Query("""
            select a.catalogItemId from ItemAlias a
            where a.tenantId = :tenantId and a.status = 'ACTIVE'
              and upper(a.aliasName) = upper(:aliasName)
            """)
    Set<Long> findActiveTargetIdsByAlias(@Param("tenantId") Long tenantId,
                                         @Param("aliasName") String aliasName);
}
