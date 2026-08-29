package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.ServiceCatalogItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ServiceCatalogItemRepository extends JpaRepository<ServiceCatalogItem, Long> {
    List<ServiceCatalogItem> findByTenantIdAndItemTypeOrderByName(Long tenantId, String itemType);
    Optional<ServiceCatalogItem> findByIdAndTenantIdAndItemType(Long id, Long tenantId, String itemType);
    boolean existsByTenantIdAndCode(Long tenantId, String code);
}
