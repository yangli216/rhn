package com.rhn.healthcore.api;

/** Shared encounter identity used when a downstream workflow must distinguish care settings. */
public interface EncounterCareSettingDirectory {
    EncounterCareSetting require(Long tenantId, Long encounterId);

    record EncounterCareSetting(
            Long encounterId, Long residentId, Long organizationId, Long departmentId,
            String encounterClass, String status) {
    }
}
