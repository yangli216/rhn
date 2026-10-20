package com.rhn.platform.organization.api;

/**
 * Read contract for modules that later check prescribing rights (ordering, pharmacy review).
 * No module enforces these rights yet; see docs/architecture/组织与人员拆分重建设计.md §4.3.
 */
public interface PractitionerQualificationDirectory {
    PractitionerQualificationView qualification(Long tenantId, Long practitionerId);
}
