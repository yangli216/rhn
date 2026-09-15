package com.rhn.platform.organization.api;

/** Synchronizes business-module extensions that are owned by a department master record. */
public interface DepartmentExtensionSynchronizer {
    void synchronize(Long tenantId, DepartmentView department, Long actorId);
}
