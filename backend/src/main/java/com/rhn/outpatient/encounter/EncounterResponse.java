package com.rhn.outpatient.encounter;

import java.time.Instant;
import java.util.List;

public record EncounterResponse(
        Long id,
        Long residentId,
        String encounterNo,
        Long organizationId,
        Long departmentId,
        Long registrationId,
        Long scheduleId,
        Long appointmentId,
        String registrationSource,
        String visitType,
        String clinicianId,
        EncounterStatus status,
        String chiefComplaint,
        Integer systolic,
        Integer diastolic,
        List<DiagnosisResponse> diagnoses,
        Instant registeredAt,
        Instant startedAt,
        Instant completedAt,
        String terminationCode,
        String terminationReason,
        Instant terminatedAt,
        Long terminatedBy
) {
    static EncounterResponse from(Encounter encounter, List<DiagnosisResponse> diagnoses) {
        return new EncounterResponse(encounter.id(), encounter.residentId(), encounter.encounterNo(),
                encounter.organizationId(), encounter.departmentId(), encounter.registrationId(), encounter.scheduleId(),
                encounter.appointmentId(), encounter.registrationSource(), encounter.visitType(),
                encounter.clinicianId(), encounter.status(),
                encounter.chiefComplaint(), encounter.systolic(), encounter.diastolic(),
                diagnoses, encounter.registeredAt(),
                encounter.startedAt(), encounter.completedAt(), encounter.terminationCode(),
                encounter.terminationReason(), encounter.terminatedAt(), encounter.terminatedBy());
    }

    public record DiagnosisResponse(Long conceptId, String systemCode, String systemVersion,
                                    String diagnosisDomain, String diagnosisGroupId,
                                    String code, String display, String type, int sortOrder,
                                    List<ManagementProgramResponse> managementPrograms) {}

    public record ManagementProgramResponse(Long id, String code, String name, String managementType,
                                            String triggerAction, String reportCardType,
                                            Integer reportDeadlineHours) {}
}
