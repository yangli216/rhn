package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.InventoryDocumentEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface InventoryDocumentEventRepository extends JpaRepository<InventoryDocumentEvent, Long> {
    List<InventoryDocumentEvent> findByTenantIdAndDocumentTypeAndDocumentIdOrderByOccurredAt(
            Long tenantId, String documentType, Long documentId);
}
