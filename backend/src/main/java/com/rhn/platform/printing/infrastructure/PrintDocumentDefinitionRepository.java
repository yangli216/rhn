package com.rhn.platform.printing.infrastructure;

import com.rhn.platform.printing.domain.PrintDocumentDefinition;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PrintDocumentDefinitionRepository extends JpaRepository<PrintDocumentDefinition, Long> {
    List<PrintDocumentDefinition> findByTenantIdIsNullAndStatusOrderByCategoryAscDocumentNameAsc(String status);
    List<PrintDocumentDefinition> findByTenantIdAndStatusOrderByCategoryAscDocumentNameAsc(Long tenantId, String status);
}
