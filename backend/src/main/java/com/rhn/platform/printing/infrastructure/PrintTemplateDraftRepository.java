package com.rhn.platform.printing.infrastructure;

import com.rhn.platform.printing.domain.PrintTemplateDraft;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PrintTemplateDraftRepository extends JpaRepository<PrintTemplateDraft, Long> {
    List<PrintTemplateDraft> findByTenantIdOrderByUpdatedAtDesc(Long tenantId);
    Optional<PrintTemplateDraft> findByIdAndTenantId(Long id, Long tenantId);
    boolean existsByTenantIdAndTemplateCodeAndStatusIn(Long tenantId, String templateCode, Collection<String> statuses);
}
