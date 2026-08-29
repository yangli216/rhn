package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.LaboratoryServiceSpecimen;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface LaboratoryServiceSpecimenRepository extends JpaRepository<LaboratoryServiceSpecimen, Long> {
    List<LaboratoryServiceSpecimen> findByTenantIdAndCatalogItemIdInOrderByCatalogItemIdAscSortOrderAsc(
            Long tenantId, Collection<Long> catalogItemIds);
    List<LaboratoryServiceSpecimen> findByTenantIdAndCatalogItemIdOrderBySortOrderAsc(Long tenantId, Long catalogItemId);
    Optional<LaboratoryServiceSpecimen> findByTenantIdAndCatalogItemIdAndId(Long tenantId, Long catalogItemId, Long id);
    boolean existsByTenantIdAndCatalogItemIdAndSpecimenItemId(Long tenantId, Long catalogItemId, Long specimenItemId);
    boolean existsByTenantIdAndCatalogItemIdAndSortOrder(Long tenantId, Long catalogItemId, int sortOrder);
    void deleteByTenantIdAndCatalogItemId(Long tenantId, Long catalogItemId);
}
