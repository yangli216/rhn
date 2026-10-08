package com.rhn.workmanagement.task;

import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.api.IdempotentDomainEventConsumer;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EncounterTaskTruthTest {
    @Mock WorkTaskRepository tasks;
    @Mock WorkTaskHistoryRepository history;
    @Mock ExecutionContextProvider contexts;
    @Mock IdempotentDomainEventConsumer consumer;
    @InjectMocks TaskService service;
    private WorkTask stored;
    private static final Instant STARTED = Instant.parse("2020-01-01T00:03:00Z");

    @BeforeEach void projectionStore() {
        when(consumer.consume(eq("work-task-projector"), any(), any())).thenAnswer(call -> {
            call.<Runnable>getArgument(2).run(); return true;
        });
        lenient().when(tasks.findByTenantIdAndDedupKey(1L, "OUTPATIENT_ENCOUNTER:3"))
                .thenAnswer(call -> Optional.ofNullable(stored));
        lenient().when(tasks.existsByTenantIdAndDedupKey(1L, "OUTPATIENT_ENCOUNTER:3"))
                .thenAnswer(call -> stored != null);
        lenient().when(tasks.save(any())).thenAnswer(call -> stored = call.getArgument(0));
    }

    private Map<String, Object> payload(String type) {
        String status = switch (type) {
            case "OUTPATIENT_REGISTERED" -> "REGISTERED";
            case "ENCOUNTER_STARTED" -> "IN_PROGRESS";
            case "ENCOUNTER_COMPLETED" -> "COMPLETED";
            case "OUTPATIENT_REGISTRATION_CANCELLED" -> "CANCELLED";
            default -> throw new IllegalArgumentException(type);
        };
        return new HashMap<>(Map.of("status", status, "departmentId", 5L, "actorId", 9L,
                "startedBy", 7L, "startedAt", STARTED.toString(), "cancelledAt", STARTED.toString()));
    }

    private void project(String type) { project(type, payload(type)); }

    private void project(String type, Map<String, Object> payload) {
        service.projectEncounterEvents(new DomainEventEnvelope(100L, 1L, 2L, type, 1,
                "Encounter", 3L, 1, 4L, STARTED.plusSeconds(60), Instant.now(),
                "actor", "test", "encounter-truth", null, payload, 1));
    }

    @ParameterizedTest @ValueSource(strings = {"ENCOUNTER_STARTED", "ENCOUNTER_COMPLETED"})
    void reception_before_registration_preserves_the_original_time_and_user(String type) {
        project(type); project("OUTPATIENT_REGISTERED"); project(type);
        assertEquals(TaskStatus.COMPLETED, stored.status());
        assertEquals(STARTED, stored.completedAt());
        assertEquals(7L, stored.completedBy());
        assertNull(stored.summary());
        assertNull(stored.dueAt());
        verify(tasks, times(1)).save(any());
        verify(history, times(1)).save(any());
    }

    @Test void completing_the_encounter_first_does_not_attribute_reception_to_the_completing_user() {
        project("OUTPATIENT_REGISTERED");
        stored.claim(8L);
        project("ENCOUNTER_COMPLETED"); project("ENCOUNTER_STARTED");
        assertEquals(TaskStatus.COMPLETED, stored.status());
        assertEquals(STARTED, stored.completedAt());
        assertEquals(7L, stored.completedBy());
        assertEquals(8L, stored.claimedBy());
    }

    @Test void a_cancelled_registration_never_looks_like_successful_reception() {
        project("OUTPATIENT_REGISTERED"); project("OUTPATIENT_REGISTRATION_CANCELLED");
        project("OUTPATIENT_REGISTERED"); project("OUTPATIENT_REGISTRATION_CANCELLED");
        assertEquals(TaskStatus.CANCELLED, stored.status());
        assertNull(stored.completedAt()); assertNull(stored.completedBy());
        verify(tasks, times(1)).save(any());
        verify(history, times(2)).save(any());
    }

    @Test void cancellation_before_registration_cannot_create_a_stale_pending_task() {
        project("OUTPATIENT_REGISTRATION_CANCELLED"); project("OUTPATIENT_REGISTERED");
        assertEquals(TaskStatus.CANCELLED, stored.status());
        assertNull(stored.completedAt()); assertNull(stored.completedBy());
        verify(tasks, times(1)).save(any());
    }

    @ParameterizedTest @ValueSource(strings = {"status", "startedAt", "startedBy", "departmentId", "actorId"})
    void missing_reception_facts_do_not_invent_a_completed_task(String field) {
        var data = payload("ENCOUNTER_STARTED"); data.remove(field);
        assertThrows(IllegalArgumentException.class, () -> project("ENCOUNTER_STARTED", data));
        assertNull(stored); verifyNoInteractions(history);
    }

    @ParameterizedTest @ValueSource(strings = {"status", "cancelledAt", "actorId", "departmentId"})
    void missing_cancellation_facts_do_not_invent_a_cancelled_task(String field) {
        var data = payload("OUTPATIENT_REGISTRATION_CANCELLED"); data.remove(field);
        assertThrows(IllegalArgumentException.class, () -> project("OUTPATIENT_REGISTRATION_CANCELLED", data));
        assertNull(stored); verifyNoInteractions(history);
    }

    @Test void an_invalid_start_cannot_close_an_existing_pending_task() {
        project("OUTPATIENT_REGISTERED");
        var data = payload("ENCOUNTER_STARTED"); data.put("startedAt", "unknown");
        assertThrows(RuntimeException.class, () -> project("ENCOUNTER_STARTED", data));
        assertEquals(TaskStatus.READY, stored.status());
        assertNull(stored.completedAt());
    }

    @Test void a_status_that_disagrees_with_the_event_cannot_close_a_task() {
        var data = payload("ENCOUNTER_STARTED"); data.put("status", "REGISTERED");
        assertThrows(IllegalArgumentException.class, () -> project("ENCOUNTER_STARTED", data));
        assertNull(stored); verifyNoInteractions(history);
    }
}
