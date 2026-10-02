package com.rhn.outpatient.encounter;

import com.rhn.platform.dictionary.api.DictionaryBinding;

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
                                    @DictionaryBinding("BD_DIAGNOSIS_DOMAIN") String diagnosisDomain,
                                    String diagnosisGroupId,
                                    String code, String display, String type, int sortOrder,
                                    List<ManagementProgramResponse> managementPrograms) {}

    public record ManagementProgramResponse(Long id, String code, String name,
                                            @DictionaryBinding("BD_DISEASE_MANAGEMENT_TYPE") String managementType,
                                            @DictionaryBinding("BD_DISEASE_TRIGGER_ACTION") String triggerAction,
                                            String reportCardType,
                                            Integer reportDeadlineHours) {}
}
