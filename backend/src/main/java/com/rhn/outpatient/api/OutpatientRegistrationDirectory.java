package com.rhn.outpatient.api;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/** Transaction boundary joining schedule inventory, registration, queue and encounter. */
public interface OutpatientRegistrationDirectory {
    Optional<RegistrationSnapshot> findByIdempotency(String idempotencyCode);

    RegistrationSnapshot register(RegisterCommand command);

    void markInService(Long encounterId, String commandCode);

    void markCompleted(Long encounterId, String commandCode);

    List<ReceptionQueueItem> queue(LocalDate queueDate);

    record RegisterCommand(Long residentId, Long encounterId, Long organizationId, Long departmentId,
                           Long scheduleId, String idempotencyCode, String registrationSource,
                           String visitType) {}

    record RegistrationSnapshot(Long registrationId, Long appointmentId, Long scheduleId, Long encounterId,
                                String registrationNo, String ticketNo, int sequenceNo, String status) {}

    record ReceptionQueueItem(Long registrationId, Long appointmentId, Long scheduleId, Long encounterId,
                              Long residentId, String healthRecordNo, String residentName, String gender,
                              LocalDate birthDate, String registrationNo, String ticketNo, int sequenceNo,
                              int priority, String registrationSource, String visitType,
                              String registrationStatus, String status,
                              String practitionerName, String serviceName, String locationName,
                              Instant registeredAt, Instant calledAt) {}
}
