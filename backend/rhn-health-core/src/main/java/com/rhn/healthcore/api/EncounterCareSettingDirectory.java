package com.rhn.healthcore.api;

import java.util.Collection;
import java.util.Map;

/** Shared encounter identity used when a downstream workflow must distinguish care settings. */
public interface EncounterCareSettingDirectory {
    EncounterCareSetting require(Long tenantId, Long encounterId);

    /**
     * 批量读取就诊类别，按 encounterId 返回；缺失项不包含。
     * 默认返回空 Map，调用方逐条回退。
     */
    default Map<Long, EncounterCareSetting> careSettings(Long tenantId, Collection<Long> encounterIds) {
        return Map.of();
    }

    record EncounterCareSetting(
            Long encounterId, Long residentId, Long organizationId, Long departmentId,
            String encounterClass, String status) {
    }
}
