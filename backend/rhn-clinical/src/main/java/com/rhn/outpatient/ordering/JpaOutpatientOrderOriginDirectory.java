package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.OutpatientOrderOriginDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

@Service
public class JpaOutpatientOrderOriginDirectory implements OutpatientOrderOriginDirectory {
    private final MedicationRequestRepository medications;
    private final ServiceRequestRepository services;

    public JpaOutpatientOrderOriginDirectory(MedicationRequestRepository medications, ServiceRequestRepository services) {
        this.medications = medications;
        this.services = services;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, OrderOrigin> findByRequestIds(Long tenantId, Set<Long> medicationIds, Set<Long> serviceIds) {
        Map<Long, OrderOrigin> origins = new HashMap<>();
        if (!medicationIds.isEmpty()) medications.findOriginsByIds(tenantId, medicationIds).forEach(value -> origins.put(value.id(),
                new OrderOrigin(value.id(), value.encounterId(), value.requestingOrganizationId(), value.requestingDepartmentId(),
                        value.authoredBy(), null)));
        if (!serviceIds.isEmpty()) services.findOriginsByIds(tenantId, serviceIds).forEach(value -> origins.put(value.id(),
                new OrderOrigin(value.id(), value.encounterId(), value.requestingOrganizationId(), value.requestingDepartmentId(),
                        value.authoredBy(), value.serviceTypeSnapshot())));
        return Map.copyOf(origins);
    }
}
