package com.rhn.platform.identityaccess.api;

import java.util.List;

public interface WorkContextDirectory {
    List<WorkContextOption> availableContexts(Long tenantId, Long userId);

    WorkContextOption requireAuthorized(Long tenantId, Long userId, Long organizationId, Long departmentId);
}
