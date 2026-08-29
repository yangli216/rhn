package com.rhn.platform.identityaccess.api;

import java.util.List;
import java.util.Set;

public interface WorkContextDirectory {
    List<WorkContextOption> availableContexts(Long tenantId, Long userId);

    WorkContextOption requireAuthorized(Long tenantId, Long userId, Long organizationId, Long departmentId);

    /**
     * Resolves the effective role and permission authorities for one validated business context.
     * Tenant-wide assignments and matching organization assignments are inherited by a department context.
     */
    Set<String> authoritiesFor(Long tenantId, Long userId, Long organizationId, Long departmentId);
}
