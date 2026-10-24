package com.rhn.outpatient.encounter;

import com.rhn.healthcore.api.EncounterCareSettingDirectory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.notFound;

@Component
public class JpaEncounterCareSettingDirectory implements EncounterCareSettingDirectory {
    private final EncounterRepository encounters;

    public JpaEncounterCareSettingDirectory(EncounterRepository encounters) {
        this.encounters = encounters;
    }

    @Override
    @Transactional(readOnly = true)
    public EncounterCareSetting require(Long tenantId, Long encounterId) {
        Encounter value = encounters.findByIdAndTenantId(encounterId, tenantId)
                .orElseThrow(() -> notFound("ENCOUNTER_NOT_FOUND", "未找到该次就诊"));
        return snapshot(value);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, EncounterCareSetting> careSettings(Long tenantId, Collection<Long> encounterIds) {
        Map<Long, EncounterCareSetting> result = new LinkedHashMap<>();
        if (tenantId == null || encounterIds == null) return result;
        List<Long> ids = encounterIds.stream().distinct().toList();
        if (ids.isEmpty()) return result;
        for (Encounter value : encounters.findByTenantIdAndIdIn(tenantId, ids)) {
            result.putIfAbsent(value.id(), snapshot(value));
        }
        return result;
    }

    private EncounterCareSetting snapshot(Encounter value) {
        return new EncounterCareSetting(value.id(), value.residentId(), value.organizationId(),
                value.departmentId(), value.encounterClass(), value.status().name());
    }
}
