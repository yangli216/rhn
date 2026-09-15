package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.LaboratoryService;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface LaboratoryServiceRepository extends JpaRepository<LaboratoryService, Long> {
    List<LaboratoryService> findByTenantIdAndCatalogItemIdIn(Long tenantId, Collection<Long> catalogItemIds);
    Optional<LaboratoryService> findByTenantIdAndCatalogItemId(Long tenantId, Long catalogItemId);
    void deleteByTenantIdAndCatalogItemId(Long tenantId, Long catalogItemId);
}
