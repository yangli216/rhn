package com.rhn.platform.printing.infrastructure;

import com.rhn.platform.printing.domain.ClinicalPrintBatchItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ClinicalPrintBatchItemRepository extends JpaRepository<ClinicalPrintBatchItem, Long> {
    List<ClinicalPrintBatchItem> findByTenantIdAndBatchIdOrderById(Long tenantId, Long batchId);
    boolean existsByTenantIdAndItemKeyAndStatus(Long tenantId, String itemKey, String status);
    Optional<ClinicalPrintBatchItem> findFirstByTenantIdAndItemKeyAndStatusOrderByCreatedAtDesc(
            Long tenantId, String itemKey, String status);
}
