package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.CatalogChangeBatchRow;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CatalogChangeBatchRowRepository extends JpaRepository<CatalogChangeBatchRow, Long> {
    List<CatalogChangeBatchRow> findByTenantIdAndBatchIdOrderByRowNumber(Long tenantId, Long batchId);
}
