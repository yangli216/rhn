package com.rhn.platform.organization.api;

/**
 * Reacts to a practitioner's staff assignments being created, ended, transferred or voided, inside the same
 * transaction as the change. Implementations must be idempotent: one personnel action may notify more than once.
 */
public interface StaffAssignmentSynchronizer {
    void synchronize(Long tenantId, Long practitionerId);
}
