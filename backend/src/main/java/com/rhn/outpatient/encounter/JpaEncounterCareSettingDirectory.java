package com.rhn.outpatient.encounter;

import com.rhn.healthcore.api.EncounterCareSettingDirectory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

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
        return new EncounterCareSetting(value.id(), value.residentId(), value.organizationId(),
                value.departmentId(), value.encounterClass(), value.status().name());
    }
}
