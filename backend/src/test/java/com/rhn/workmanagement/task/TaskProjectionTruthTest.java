package com.rhn.workmanagement.task;

import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.api.IdempotentDomainEventConsumer;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TaskProjectionTruthTest {
    @Mock WorkTaskRepository tasks;
    @Mock WorkTaskHistoryRepository history;
    @Mock ExecutionContextProvider contexts;
    @Mock IdempotentDomainEventConsumer consumer;
    @InjectMocks TaskService service;

    @BeforeEach void executeProjection() {
        when(consumer.consume(eq("work-task-projector"), any(), any())).thenAnswer(call -> {
            call.<Runnable>getArgument(2).run();
            return true;
        });
    }

    private DomainEventEnvelope event(String type, Map<String, Object> payload) {
        Instant occurred = Instant.parse("2026-01-01T00:00:00Z");
        return new DomainEventEnvelope(100L, 1L, 2L, type, 1, type.equals("OUTPATIENT_REGISTERED") ? "Encounter" : "TestAggregate", 3L, 1,
                4L, occurred, occurred, "test", "test", "truth-test", null, payload, 1);
    }

    private static Map<String, Object> carePayload() {
        return new HashMap<>(Map.of("title", "真实任务标题", "summary", "来源任务说明", "priority", "HIGH",
                "dueAt", "2026-02-03T04:05:06Z", "departmentId", 5L, "encounterId", 6L));
    }

    static Stream<Map<String, Object>> invalidCarePayloads() {
        return Stream.of(new Object[]{"title", null}, new Object[]{"title", " "},
                new Object[]{"title", 123}, new Object[]{"priority", null}, new Object[]{"priority", ""},
                new Object[]{"priority", "UNKNOWN"}, new Object[]{"dueAt", ""},
                new Object[]{"dueAt", "not-a-date"}, new Object[]{"dueAt", 123},
                new Object[]{"summary", 123}).map(invalid -> {
                    Map<String, Object> payload = carePayload();
                    payload.put((String) invalid[0], invalid[1]);
                    return payload;
                });
    }

    @ParameterizedTest @MethodSource("invalidCarePayloads")
    void invalid_care_event_cannot_create_a_plausible_task(Map<String, Object> payload) {
        assertThrows(RuntimeException.class, () -> service.projectEncounterEvents(event("CARE_TASK_READY", payload)));
        verify(tasks, never()).save(any());
        verifyNoInteractions(history);
    }

    @Test void care_projection_preserves_source_fields() {
        service.projectEncounterEvents(event("CARE_TASK_READY", carePayload()));
        var captured = ArgumentCaptor.forClass(WorkTask.class);
        verify(tasks).save(captured.capture());
        WorkTask task = captured.getValue();
        assertEquals("真实任务标题", task.title());
        assertEquals("来源任务说明", task.summary());
        assertEquals(TaskPriority.HIGH, task.priority());
        assertEquals(Instant.parse("2026-02-03T04:05:06Z"), task.dueAt());
        assertEquals("/care-management?taskId=3", task.routePath());
    }

    @Test void absent_optional_fields_remain_unknown_instead_of_creating_an_overdue_deadline() {
        Map<String, Object> payload = carePayload();
        payload.remove("dueAt");
        payload.remove("summary");
        service.projectEncounterEvents(event("CARE_TASK_READY", payload));
        var captured = ArgumentCaptor.forClass(WorkTask.class);
        verify(tasks).save(captured.capture());
        assertNull(captured.getValue().dueAt());
        assertNull(captured.getValue().summary());
    }

    @Test void an_urgent_update_preserves_the_claim_and_cannot_be_downgraded_by_old_events() {
        WorkTask task = WorkTask.departmentTask(1L, 2L, 5L, "CONTINUOUS_CARE", "普通复查", "原始说明",
                TaskPriority.HIGH, 4L, 6L, "TestAggregate", 3L, "/care-management?taskId=3", "CARE_TASK:3",
                Instant.parse("2026-02-03T04:05:06Z"), 7L);
        task.claim(8L);
        when(tasks.findByTenantIdAndDedupKey(1L, "CARE_TASK:3")).thenReturn(Optional.of(task));
        Map<String, Object> urgent = carePayload();
        urgent.put("priority", "URGENT"); urgent.put("title", "立即复测");
        urgent.put("dueAt", "2026-01-01T00:00:00Z");
        service.projectEncounterEvents(event("CARE_TASK_READY", urgent));
        assertEquals(TaskPriority.URGENT, task.priority());
        assertEquals("立即复测", task.title());
        assertEquals(Instant.parse("2026-01-01T00:00:00Z"), task.dueAt());
        assertEquals(TaskStatus.IN_PROGRESS, task.status());
        assertEquals(8L, task.claimedBy());
        service.projectEncounterEvents(event("CARE_TASK_READY", urgent));
        service.projectEncounterEvents(event("CARE_TASK_READY", carePayload()));
        assertEquals(TaskPriority.URGENT, task.priority());
        assertEquals("立即复测", task.title());
        assertEquals(Instant.parse("2026-01-01T00:00:00Z"), task.dueAt());
        verify(history, times(1)).save(any());
        verify(tasks, never()).save(any());
    }

    @ParameterizedTest @ValueSource(strings = {"OUTPATIENT_REGISTERED", "CLINICAL_DOCUMENT_READY_FOR_SIGNATURE"})
    void no_source_deadline_means_no_invented_two_or_four_hour_deadline(String eventType) {
        service.projectEncounterEvents(event(eventType, signaturePayload(1)));
        var captured = ArgumentCaptor.forClass(WorkTask.class);
        verify(tasks).save(captured.capture());
        assertNull(captured.getValue().dueAt());
    }

    @ParameterizedTest @ValueSource(strings = {"OUTPATIENT_REGISTERED", "CLINICAL_DOCUMENT_READY_FOR_SIGNATURE"})
    void an_explicit_source_deadline_is_preserved_even_when_the_event_is_delayed(String eventType) {
        Instant deadline = Instant.parse("2020-01-01T00:00:00Z");
        var payload = signaturePayload(1);
        payload.put("dueAt", deadline.toString());
        service.projectEncounterEvents(event(eventType, payload));
        var captured = ArgumentCaptor.forClass(WorkTask.class);
        verify(tasks).save(captured.capture());
        assertEquals(deadline, captured.getValue().dueAt());
    }

    @ParameterizedTest @ValueSource(strings = {"OUTPATIENT_REGISTERED", "CLINICAL_DOCUMENT_READY_FOR_SIGNATURE"})
    void an_invalid_deadline_cannot_create_or_supersede_tasks(String eventType) {
        assertThrows(RuntimeException.class, () -> service.projectEncounterEvents(
                event(eventType, Map.of("documentVersion", 2, "dueAt", "not-a-date"))));
        verifyNoInteractions(tasks, history);
    }

    private Map<String, Object> signaturePayload(Object version) {
        return new HashMap<>(Map.of("documentVersion", version, "documentTitle", "实际临床文档",
                "residentId", 4L, "encounterId", 6L, "departmentId", 5L, "status", "REGISTERED", "actorId", 7L));
    }

    static Stream<Object> invalidVersions() {
        return Stream.of(null, "", 0, -1, 1.5, 2147483648L, "invalid", true);
    }

    @ParameterizedTest @MethodSource("invalidVersions")
    void invalid_document_version_cannot_replace_or_complete_signature_tasks(Object version) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("documentVersion", version);
        for (String type : new String[]{"CLINICAL_DOCUMENT_READY_FOR_SIGNATURE", "CLINICAL_DOCUMENT_SIGNED"}) {
            assertThrows(IllegalArgumentException.class, () -> service.projectEncounterEvents(event(type, payload)));
        }
        verifyNoInteractions(tasks, history);
    }

    @Test void valid_document_version_is_used_without_a_fallback() {
        service.projectEncounterEvents(event("CLINICAL_DOCUMENT_READY_FOR_SIGNATURE", signaturePayload("7")));
        var captured = ArgumentCaptor.forClass(WorkTask.class);
        verify(tasks).save(captured.capture());
        verify(tasks).existsByTenantIdAndDedupKey(1L, "CLINICAL_DOCUMENT_SIGN:3:7");
        assertEquals("CLINICAL_DOCUMENT_SIGN", captured.getValue().taskType());
    }
}
