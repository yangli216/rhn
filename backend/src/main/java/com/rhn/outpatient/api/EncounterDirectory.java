package com.rhn.outpatient.api;

import java.util.Collection;
import java.util.List;

/** Public outpatient encounter contract used by sibling clinical request modules. */
public interface EncounterDirectory {
    EncounterSnapshot requireAccessible(Long encounterId);
    EncounterSnapshot requireActiveForOrdering(Long encounterId);
    List<EncounterSnapshot> findAccessible(Collection<Long> encounterIds);
    PharmacyClinicalSnapshot requireForPharmacy(Long tenantId, Long encounterId);

    void validateRegistration(RegistrationEligibilityCommand command);

    EncounterSnapshot completeRegistration(RegistrationCompletionCommand command);

    record RegistrationEligibilityCommand(Long residentId, Long organizationId, Long departmentId) {}

    record RegistrationCompletionCommand(
            Long residentId, Long organizationId, Long departmentId, Long appointmentId, Long scheduleId, Long slotHoldId,
            String idempotencyCode, String registrationSource, String visitType) {}

    record EncounterSnapshot(
            Long id, Long tenantId, Long residentId, Long organizationId, Long departmentId,
            String encounterNo, String clinicianId, String status, long revision) {}

    record PharmacyClinicalSnapshot(
            Long encounterId, Long residentId, String encounterNo, String clinicianId,
            String chiefComplaint, List<DiagnosisSnapshot> diagnoses) {}

    record DiagnosisSnapshot(String code, String display, String type) {}
}
