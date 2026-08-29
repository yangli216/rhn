package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.MasterDataImportRow;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MasterDataImportRowRepository extends JpaRepository<MasterDataImportRow, Long> {
    List<MasterDataImportRow> findByTenantIdAndBatchIdOrderByRowNumber(Long tenantId, Long batchId);
    Optional<MasterDataImportRow> findByIdAndTenantIdAndBatchId(Long id, Long tenantId, Long batchId);
}
