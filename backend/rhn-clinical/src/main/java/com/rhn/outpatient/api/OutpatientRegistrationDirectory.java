package com.rhn.outpatient.api;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/** Transaction boundary joining schedule inventory, registration, queue and encounter. */
public interface OutpatientRegistrationDirectory {
    Optional<RegistrationSnapshot> findByIdempotency(String idempotencyCode);

    RegistrationSnapshot register(RegisterCommand command);

    void requireDirectReceptionAllowed(Long encounterId);

    void markInService(Long encounterId, String commandCode);

    void markSuspended(Long encounterId, String commandCode, String reason);

    void markResumed(Long encounterId, String commandCode);

    void markCompleted(Long encounterId, String commandCode);

    void markTransferred(Long encounterId, String commandCode, String reason);

    void markTerminated(Long encounterId, String commandCode, String reason);

    CancellationSnapshot requireCancellationReady(Long encounterId);

    CancellationSnapshot cancelBeforeService(Long encounterId, String commandCode, String reason);

    List<ReceptionQueueItem> queue(LocalDate queueDate);

    List<ReceptionQueueItem> queue(LocalDate dateFrom, LocalDate dateTo);

    /** Organization-wide queue used by centralized arrival screening and triage stations. */
    List<ReceptionQueueItem> organizationQueue(LocalDate queueDate);

    record RegisterCommand(Long residentId, Long encounterId, Long organizationId, Long departmentId,
                           Long appointmentId, Long scheduleId, Long slotHoldId, String idempotencyCode, String registrationSource,
                           String visitType) {}

    record RegistrationSnapshot(Long registrationId, Long appointmentId, Long scheduleId, Long encounterId,
                                String registrationNo, String ticketNo, int sequenceNo, String status) {}

    record CancellationSnapshot(Long registrationId, Long appointmentId, Long scheduleId,
                                String registrationStatus, String queueStatus, String appointmentStatus) {}

    record ReceptionQueueItem(Long registrationId, Long appointmentId, Long scheduleId, Long encounterId,
                              Long ticketId, Long serviceQueueId,
                              Long residentId, String healthRecordNo, String residentName, String gender,
                              LocalDate birthDate, String registrationNo, String ticketNo, int sequenceNo,
                              int priority, String registrationSource, String visitType,
                              String registrationStatus, String status,
                              String practitionerName, String serviceName, String locationName,
                              Instant registeredAt, Instant readyAt, Instant calledAt, Instant startedAt,
                              int callCount, int missedCount, Long currentLocationId,
                              Instant validUntil,
                              String registeredByName, String departmentName, String sdDayPartText,
                              Long practitionerId, String clinicianId, String clinicianName, Instant completedAt,
                              Long departmentId, String phone) {
        public ReceptionQueueItem(Long registrationId, Long appointmentId, Long scheduleId, Long encounterId,
                                  Long ticketId, Long serviceQueueId,
                                  Long residentId, String healthRecordNo, String residentName, String gender,
                                  LocalDate birthDate, String registrationNo, String ticketNo, int sequenceNo,
                                  int priority, String registrationSource, String visitType,
                                  String registrationStatus, String status,
                                  String practitionerName, String serviceName, String locationName,
                                  Instant registeredAt, Instant readyAt, Instant calledAt, Instant startedAt,
                                  int callCount, int missedCount, Long currentLocationId) {
            this(registrationId, appointmentId, scheduleId, encounterId, ticketId, serviceQueueId,
                    residentId, healthRecordNo, residentName, gender, birthDate, registrationNo, ticketNo,
                    sequenceNo, priority, registrationSource, visitType, registrationStatus, status,
                    practitionerName, serviceName, locationName, registeredAt, readyAt, calledAt, startedAt,
                    callCount, missedCount, currentLocationId, null, null, null, null,
                    null, null, null, null, null, null);
        }

        public ReceptionQueueItem(Long registrationId, Long appointmentId, Long scheduleId, Long encounterId,
                                  Long ticketId, Long serviceQueueId,
                                  Long residentId, String healthRecordNo, String residentName, String gender,
                                  LocalDate birthDate, String registrationNo, String ticketNo, int sequenceNo,
                                  int priority, String registrationSource, String visitType,
                                  String registrationStatus, String status,
                                  String practitionerName, String serviceName, String locationName,
                                  Instant registeredAt, Instant readyAt, Instant calledAt, Instant startedAt,
                                  int callCount, int missedCount, Long currentLocationId,
                                  Instant validUntil) {
            this(registrationId, appointmentId, scheduleId, encounterId, ticketId, serviceQueueId,
                    residentId, healthRecordNo, residentName, gender, birthDate, registrationNo, ticketNo,
                    sequenceNo, priority, registrationSource, visitType, registrationStatus, status,
                    practitionerName, serviceName, locationName, registeredAt, readyAt, calledAt, startedAt,
                    callCount, missedCount, currentLocationId, validUntil, null, null, null,
                    null, null, null, null, null, null);
        }
    }
}
