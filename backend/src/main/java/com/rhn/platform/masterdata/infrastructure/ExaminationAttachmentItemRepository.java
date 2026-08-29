package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.ExaminationAttachmentItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ExaminationAttachmentItemRepository extends JpaRepository<ExaminationAttachmentItem, Long> {
    List<ExaminationAttachmentItem> findByTenantIdAndCatalogItemIdOrderBySortOrderAsc(Long tenantId, Long catalogItemId);
    Optional<ExaminationAttachmentItem> findByTenantIdAndCatalogItemIdAndId(Long tenantId, Long catalogItemId, Long id);
    void deleteByTenantIdAndCatalogItemId(Long tenantId, Long catalogItemId);
}
