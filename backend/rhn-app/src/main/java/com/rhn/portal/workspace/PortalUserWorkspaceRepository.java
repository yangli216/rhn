package com.rhn.portal.workspace;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

interface PortalUserWorkspaceRepository extends JpaRepository<PortalUserWorkspace, Long> {
    Optional<PortalUserWorkspace> findByTenantIdAndUserId(Long tenantId, Long userId);
}
