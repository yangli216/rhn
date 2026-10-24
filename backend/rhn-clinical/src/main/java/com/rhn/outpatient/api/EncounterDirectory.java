package com.rhn.outpatient.api;

import java.util.Collection;
import java.util.List;
import java.util.Map;

/** Public outpatient encounter contract used by sibling clinical request modules. */
public interface EncounterDirectory {
    EncounterSnapshot requireAccessible(Long encounterId);
    EncounterSnapshot requireOrganizationAccessible(Long encounterId);
    EncounterServiceSnapshot requireOrganizationAccessibleService(Long encounterId);
    EncounterSnapshot requireActiveForOrdering(Long encounterId);
    /** Serializes medication writes and the subsequent encounter-wide safety evaluation in the caller's transaction. */
    EncounterSnapshot lockActiveForOrdering(Long encounterId);
    /** 退号准备前锁定就诊并确认仍可退号，使退款意向与接诊开始互斥。 */
    EncounterSnapshot lockRegistrationCancellable(Long encounterId);
    List<EncounterSnapshot> findAccessible(Collection<Long> encounterIds);
    List<EncounterSnapshot> findOrganizationAccessible(Collection<Long> encounterIds);
    /** Current organization/department's completed outpatient visits, filtered before the ten-visit limit. */
    List<EncounterSnapshot> recentCompletedForResident(Long residentId, Long excludedEncounterId,
                                                       java.time.Instant registeredSince, int limit);
    PharmacyClinicalSnapshot requireForPharmacy(Long tenantId, Long encounterId);

    /**
     * 批量读取药房审方所需临床快照（就诊与活动诊断），按 encounterId 返回；缺失项不包含。
     * 默认返回空 Map，调用方逐条回退。
     */
    default Map<Long, PharmacyClinicalSnapshot> pharmacySnapshots(Long tenantId, Collection<Long> encounterIds) {
        return Map.of();
    }

    void validateRegistration(RegistrationEligibilityCommand command);

    EncounterSnapshot completeRegistration(RegistrationCompletionCommand command);

    record RegistrationEligibilityCommand(Long residentId, Long organizationId, Long departmentId) {}

    record RegistrationCompletionCommand(
            Long residentId, Long organizationId, Long departmentId, Long appointmentId, Long scheduleId, Long slotHoldId,
            String idempotencyCode, String registrationSource, String visitType) {}

    record EncounterSnapshot(
            Long id, Long tenantId, Long residentId, Long organizationId, Long departmentId,
            String encounterNo, String clinicianId, String status, long revision,
            String departmentName, java.time.Instant registeredAt) {}

    record EncounterServiceSnapshot(EncounterSnapshot encounter, java.time.Instant startedAt, java.time.Instant completedAt) {}

    record PharmacyClinicalSnapshot(
            Long encounterId, Long residentId, String encounterNo, String clinicianId,
            String chiefComplaint, List<DiagnosisSnapshot> diagnoses) {}

    record DiagnosisSnapshot(String code, String display, String type) {}
}
