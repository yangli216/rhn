package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.ExaminationService;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ExaminationServiceRepository extends JpaRepository<ExaminationService, Long> {
    List<ExaminationService> findByTenantIdAndCatalogItemIdIn(Long tenantId, Collection<Long> catalogItemIds);
    Optional<ExaminationService> findByTenantIdAndCatalogItemId(Long tenantId, Long catalogItemId);
    void deleteByTenantIdAndCatalogItemId(Long tenantId, Long catalogItemId);
}
