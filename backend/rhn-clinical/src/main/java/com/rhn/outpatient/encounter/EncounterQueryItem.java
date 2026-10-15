package com.rhn.outpatient.encounter;

import com.rhn.platform.dictionary.api.DictionaryBinding;

import java.time.Instant;
import java.time.LocalDate;

public record EncounterQueryItem(
        Long id,
        String encounterNo,
        Long residentId,
        String healthRecordNo,
        String residentName,
        @DictionaryBinding("RESIDENT_GENDER") String gender,
        LocalDate birthDate,
        String phone,
        Long organizationId,
        Long departmentId,
        String departmentName,
        Long registrationId,
        String registrationNo,
        @DictionaryBinding("SC_REGISTRATION_SOURCE") String registrationSource,
        @DictionaryBinding("SC_VISIT_TYPE") String visitType,
        String clinicianId,
        String clinicianName,
        String status,
        String chiefComplaint,
        Integer systolic,
        Integer diastolic,
        String primaryDiagnosisName,
        String primaryDiagnosisCode,
        int diagnosisCount,
        String serviceName,
        String locationName,
        Instant registeredAt,
        Instant startedAt,
        Instant completedAt
) {
}
