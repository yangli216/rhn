package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.MasterDataImportBatch;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MasterDataImportBatchRepository extends JpaRepository<MasterDataImportBatch, Long> {
    Optional<MasterDataImportBatch> findByTenantIdAndRequestCode(Long tenantId, String requestCode);
    Optional<MasterDataImportBatch> findByIdAndTenantId(Long id, Long tenantId);
    List<MasterDataImportBatch> findTop50ByTenantIdOrderByCreatedAtDesc(Long tenantId);
}
