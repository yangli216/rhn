package com.rhn.outpatient.encounter;

import com.rhn.outpatient.api.EncounterFlowDirectory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

@Service
class JpaEncounterFlowDirectory implements EncounterFlowDirectory {
    private final EncounterRepository encounters;

    JpaEncounterFlowDirectory(EncounterRepository encounters) {
        this.encounters = encounters;
    }

    @Override
    @Transactional(readOnly = true)
    public List<EncounterFlowSnapshot> findRecent(Long tenantId, Long organizationId, Long departmentId,
                                                  Instant fromInclusive, Instant toExclusive, int limit) {
        int pageSize = Math.max(1, Math.min(limit, 200));
        return encounters
                .findByTenantIdAndOrganizationIdAndDepartmentIdAndRegisteredAtGreaterThanEqualAndRegisteredAtLessThanOrderByRegisteredAtDesc(
                        tenantId, organizationId, departmentId, fromInclusive, toExclusive,
                        PageRequest.of(0, pageSize))
                .stream().map(value -> new EncounterFlowSnapshot(value.id(), value.residentId(),
                        value.encounterNo(), value.organizationId(), value.departmentId(), value.clinicianId(),
                        value.status().name(), value.registeredAt(), value.startedAt(), value.completedAt(),
                        value.terminationCode(), value.terminationReason(), value.terminatedAt()))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<EncounterFlowSnapshot> findByIds(Long tenantId, Collection<Long> encounterIds) {
        if (encounterIds == null || encounterIds.isEmpty()) return List.of();
        return encounters.findByTenantIdAndIdIn(tenantId, encounterIds).stream()
                .map(value -> new EncounterFlowSnapshot(value.id(), value.residentId(),
                        value.encounterNo(), value.organizationId(), value.departmentId(), value.clinicianId(),
                        value.status().name(), value.registeredAt(), value.startedAt(), value.completedAt(),
                        value.terminationCode(), value.terminationReason(), value.terminatedAt()))
                .toList();
    }
}
