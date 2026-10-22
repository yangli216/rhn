package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory.EncounterSnapshot;
import com.rhn.outpatient.api.OrderSigningDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class OrderSigningDirectoryService implements OrderSigningDirectory {
    private final OrderReviewModePolicy reviewModePolicy;
    private final MedicationRequestRepository medicationRequests;
    private final ServiceRequestRepository serviceRequests;

    OrderSigningDirectoryService(OrderReviewModePolicy reviewModePolicy, MedicationRequestRepository medicationRequests,
                                 ServiceRequestRepository serviceRequests) {
        this.reviewModePolicy = reviewModePolicy;
        this.medicationRequests = medicationRequests;
        this.serviceRequests = serviceRequests;
    }

    @Override
    @Transactional(readOnly = true)
    public int unsignedOrderCount(EncounterSnapshot encounter) {
        if (reviewModePolicy.resolve(encounter) == OrderReviewModePolicy.Mode.SIMPLE) return 0;
        long medications = medicationRequests
                .findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(encounter.tenantId(), encounter.id()).stream()
                .filter(request -> request.status() == MedicationRequestStatus.DRAFT).count();
        int services = serviceRequests.findByTenantIdAndEncounterIdAndStatusOrderByAuthoredAtAscIdAsc(
                encounter.tenantId(), encounter.id(), ServiceRequestStatus.DRAFT).size();
        return Math.toIntExact(medications) + services;
    }
}
