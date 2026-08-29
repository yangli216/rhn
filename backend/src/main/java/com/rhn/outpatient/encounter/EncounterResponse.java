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
        Instant completedAt
) {
    static EncounterResponse from(Encounter encounter, List<EncounterDiagnosis> diagnoses) {
        return new EncounterResponse(encounter.id(), encounter.residentId(), encounter.encounterNo(),
                encounter.organizationId(), encounter.departmentId(), encounter.registrationId(), encounter.scheduleId(),
                encounter.appointmentId(), encounter.registrationSource(), encounter.visitType(),
                encounter.clinicianId(), encounter.status(),
                encounter.chiefComplaint(), encounter.systolic(), encounter.diastolic(),
                diagnoses.stream().map(DiagnosisResponse::from).toList(), encounter.registeredAt(),
                encounter.startedAt(), encounter.completedAt());
    }

    public record DiagnosisResponse(String code, String display, String type) {
        static DiagnosisResponse from(EncounterDiagnosis diagnosis) {
            return new DiagnosisResponse(diagnosis.code(), diagnosis.display(), diagnosis.diagnosisType().name());
        }
    }
}
