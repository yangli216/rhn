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
class CriticalValueTaskTruthTest {
    @Mock WorkTaskRepository tasks;
    @Mock WorkTaskHistoryRepository history;
    @Mock ExecutionContextProvider contexts;
    @Mock IdempotentDomainEventConsumer consumer;
    @InjectMocks TaskService service;
    private WorkTask stored;
    private final Instant deadline = Instant.parse("2020-01-01T00:07:00Z");
    private final Instant acknowledgedAt = Instant.parse("2020-01-01T00:03:00Z");

    @BeforeEach void projectionStore() {
        when(consumer.consume(eq("work-task-projector"), any(), any())).thenAnswer(call -> {
            call.<Runnable>getArgument(2).run(); return true;
        });
        lenient().when(tasks.findByTenantIdAndDedupKey(1L, "CRITICAL_VALUE:3"))
                .thenAnswer(call -> Optional.ofNullable(stored));
        lenient().when(tasks.save(any())).thenAnswer(call -> { stored = call.getArgument(0); return stored; });
    }

    private Map<String, Object> payload(String status) {
        return new HashMap<>(Map.of("status", status, "departmentId", 5L, "encounterId", 6L, "recipientUserId", 7L,
                "acknowledgeDeadlineAt", deadline.toString(), "observationName", "实际检验指标", "triggerEvidence", "实际危急值证据"));
    }

    private void project(String status, Map<String, Object> payload) {
        String suffix = "OPEN".equals(status) ? "OPENED" : status;
        service.projectEncounterEvents(new DomainEventEnvelope(100L, 1L, 2L, "DIAGNOSTIC_CRITICAL_VALUE_" + suffix,
                1, "CriticalValueAlert", 3L, 1, 4L, acknowledgedAt.plusSeconds(60), Instant.now(),
                "actor", "test", "critical-truth", null, payload, 1));
    }

    private Map<String, Object> acknowledged(String status) {
        var payload = payload(status);
        payload.put("acknowledgedAt", acknowledgedAt.toString()); payload.put("acknowledgedBy", 7L);
        return payload;
    }

    @Test void delayed_open_uses_the_persisted_deadline_and_evidence_without_starting_a_new_window() {
        project("OPEN", payload("OPEN"));
        assertEquals(deadline, stored.dueAt());
        assertEquals("实际危急值证据", stored.summary());
        assertTrue(stored.title().contains("实际检验指标"));
        assertEquals(7L, stored.assigneeId());
        assertEquals(TaskStatus.READY, stored.status());
    }

    @ParameterizedTest @ValueSource(strings = {"acknowledgeDeadlineAt", "observationName", "triggerEvidence", "recipientUserId", "departmentId", "encounterId"})
    void missing_source_facts_do_not_create_a_plausible_reminder(String field) {
        var payload = payload("OPEN"); payload.remove(field);
        assertThrows(RuntimeException.class, () -> project("OPEN", payload));
        assertNull(stored); verifyNoInteractions(history);
    }

    @Test void an_invalid_deadline_is_not_replaced_with_fifteen_minutes() {
        var payload = payload("OPEN"); payload.put("acknowledgeDeadlineAt", "invalid");
        assertThrows(RuntimeException.class, () -> project("OPEN", payload));
        assertNull(stored);
    }

    @ParameterizedTest @ValueSource(strings = {"ACKNOWLEDGED", "CLOSED", "SUPERSEDED"})
    void actual_acknowledgement_survives_out_of_order_delivery_and_records_its_original_time(String status) {
        project(status, acknowledged(status));
        assertEquals(TaskStatus.COMPLETED, stored.status());
        assertEquals(acknowledgedAt, stored.completedAt());
        WorkTask first = stored;
        project("OPEN", payload("OPEN"));
        assertSame(first, stored);
        assertEquals(TaskStatus.COMPLETED, stored.status());
        verify(tasks, times(1)).save(any());
    }

    @Test void replacement_without_acknowledgement_cancels_instead_of_fabricating_completion() {
        project("SUPERSEDED", payload("SUPERSEDED"));
        assertEquals(TaskStatus.CANCELLED, stored.status());
        assertNull(stored.completedAt());
        project("OPEN", payload("OPEN"));
        assertEquals(TaskStatus.CANCELLED, stored.status());
        verify(tasks, times(1)).save(any());
    }

    @Test void replacement_of_an_existing_pending_task_cancels_it() {
        project("OPEN", payload("OPEN"));
        project("SUPERSEDED", payload("SUPERSEDED"));
        assertEquals(TaskStatus.CANCELLED, stored.status());
        assertNull(stored.completedAt());
    }

    @ParameterizedTest @ValueSource(strings = {"acknowledgedAt", "acknowledgedBy"})
    void incomplete_acknowledgement_facts_cannot_complete_a_task(String field) {
        project("OPEN", payload("OPEN"));
        var payload = acknowledged("ACKNOWLEDGED"); payload.remove(field);
        assertThrows(RuntimeException.class, () -> project("ACKNOWLEDGED", payload));
        assertEquals(TaskStatus.READY, stored.status()); assertNull(stored.completedAt());
    }

    @Test void event_name_cannot_override_a_contradictory_source_status() {
        assertThrows(IllegalArgumentException.class, () -> project("ACKNOWLEDGED", acknowledged("OPEN")));
        assertNull(stored); verifyNoInteractions(history);
    }
}
