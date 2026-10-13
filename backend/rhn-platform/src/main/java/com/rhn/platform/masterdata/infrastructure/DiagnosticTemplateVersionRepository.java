package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.DiagnosticTemplateVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface DiagnosticTemplateVersionRepository extends JpaRepository<DiagnosticTemplateVersion, Long> {
    Optional<DiagnosticTemplateVersion> findTopByTenantIdAndOrganizationIdAndCatalogItemIdOrderByVersionDesc(
            Long tenantId, Long organizationId, Long catalogItemId);
    Optional<DiagnosticTemplateVersion> findTopByTenantIdAndOrganizationIdAndCatalogItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDescVersionDesc(
            Long tenantId, Long organizationId, Long catalogItemId, LocalDate date);
    Optional<DiagnosticTemplateVersion> findByIdAndTenantIdAndOrganizationIdAndCatalogItemId(
            Long id, Long tenantId, Long organizationId, Long catalogItemId);
    List<DiagnosticTemplateVersion> findByTenantIdAndOrganizationIdAndCatalogItemIdOrderByVersionDesc(
            Long tenantId, Long organizationId, Long catalogItemId);
}
