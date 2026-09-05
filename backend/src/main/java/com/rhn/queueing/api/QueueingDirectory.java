package com.rhn.queueing.api;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;

public interface QueueingDirectory {
    TicketSnapshot checkIn(CheckInCommand command);

    TicketSnapshot requireBySource(String sourceType, Long sourceId);

    Map<Long, TicketSnapshot> findBySources(String sourceType, Iterable<Long> sourceIds);

    TicketSnapshot startBySource(String sourceType, Long sourceId, String commandCode,
                                 Long serviceLocationId, String description, boolean callIfWaiting);

    TicketSnapshot suspendBySource(String sourceType, Long sourceId, String commandCode, String description);

    TicketSnapshot resumeBySource(String sourceType, Long sourceId, String commandCode,
                                  Long serviceLocationId, String description);

    TicketSnapshot completeBySource(String sourceType, Long sourceId, String commandCode, String description);

    TicketSnapshot cancelBySource(String sourceType, Long sourceId, String commandCode, String description);

    record CheckInCommand(Long organizationId, Long departmentId, Long waitingLocationId,
                          String queueCode, String queueName, String scene, String ticketPrefix,
                          Long residentId, Long encounterId, String sourceType, Long sourceId,
                          int priority, boolean ready, String commandCode) {}

    record ServiceQueueSnapshot(Long id, long revision, Long organizationId, Long departmentId,
                                Long waitingLocationId, String code, String name, String scene,
                                String ticketPrefix, boolean active) {}

    record TicketSnapshot(Long id, long revision, Long serviceQueueId, Long residentId, Long encounterId,
                          String sourceType, Long sourceId, LocalDate businessDate, String ticketCode,
                          int sequenceNo, int priority, String status, Instant checkedInAt, Instant readyAt,
                          Instant calledAt, Instant startedAt, Instant completedAt, int callCount,
                          int missedCount, Long currentLocationId) {}
}
