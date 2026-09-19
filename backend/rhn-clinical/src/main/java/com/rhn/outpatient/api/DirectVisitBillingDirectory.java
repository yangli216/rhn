package com.rhn.outpatient.api;

/** Direct reception posts an optional service charge; it never initiates payment or settlement. */
public interface DirectVisitBillingDirectory {
    void requireNoPendingRegistration(Long residentId, Long organizationId, Long departmentId);
    void requireRegistrationPaid(Long encounterId);
    void chargeService(Long residentId, Long encounterId, Long organizationId, Long departmentId, Long catalogItemId);
}
