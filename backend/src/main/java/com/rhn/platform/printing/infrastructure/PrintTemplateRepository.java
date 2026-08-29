package com.rhn.platform.printing.infrastructure;

import com.rhn.platform.printing.domain.PrintTemplate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PrintTemplateRepository extends JpaRepository<PrintTemplate, Long> {
    Optional<PrintTemplate> findFirstByTenantIdAndDocumentTypeAndStatusOrderByUpdatedAtDesc(
            Long tenantId, String documentType, String status);
    Optional<PrintTemplate> findFirstByTenantIdIsNullAndDocumentTypeAndStatusOrderByUpdatedAtDesc(
            String documentType, String status);
    List<PrintTemplate> findByTenantIdAndStatusOrderByDocumentType(Long tenantId, String status);
    List<PrintTemplate> findByTenantIdIsNullAndStatusOrderByDocumentType(String status);
}
