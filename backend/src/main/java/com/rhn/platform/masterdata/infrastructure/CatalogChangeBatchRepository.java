package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.CatalogChangeBatch;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CatalogChangeBatchRepository extends JpaRepository<CatalogChangeBatch, Long> {
    Optional<CatalogChangeBatch> findByIdAndTenantId(Long id, Long tenantId);
    Optional<CatalogChangeBatch> findByTenantIdAndRequestCode(Long tenantId, String requestCode);
}
