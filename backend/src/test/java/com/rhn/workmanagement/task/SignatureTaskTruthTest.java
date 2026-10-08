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
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SignatureTaskTruthTest {
    @Mock WorkTaskRepository tasks;
    @Mock WorkTaskHistoryRepository history;
    @Mock ExecutionContextProvider contexts;
    @Mock IdempotentDomainEventConsumer consumer;
    @InjectMocks TaskService service;
    private final Map<Integer, WorkTask> stored = new LinkedHashMap<>();
    private final Instant signedAt = Instant.parse("2020-01-01T00:03:00Z");

    @BeforeEach void projectionStore() {
        when(consumer.consume(eq("work-task-projector"), any(), any())).thenAnswer(call -> {
            call.<Runnable>getArgument(2).run(); return true;
        });
        lenient().when(tasks.findByTenantIdAndDedupKey(eq(1L), anyString())).thenAnswer(call -> Optional.ofNullable(
                stored.get(Integer.parseInt(call.<String>getArgument(1).substring("CLINICAL_DOCUMENT_SIGN:3:".length())))));
        lenient().when(tasks.existsByTenantIdAndDedupKey(eq(1L), anyString())).thenAnswer(call ->
                stored.containsKey(Integer.parseInt(call.<String>getArgument(1).substring("CLINICAL_DOCUMENT_SIGN:3:".length()))));
        lenient().when(tasks.findByTenantIdAndSourceTypeAndSourceIdAndTaskTypeOrderByCreatedAtDesc(
                1L, "ClinicalDocument", 3L, "CLINICAL_DOCUMENT_SIGN")).thenAnswer(call -> stored.values().stream().toList());
        lenient().when(tasks.save(any())).thenAnswer(call -> {
            WorkTask task = call.getArgument(0); stored.put(task.signatureDocumentVersion(), task); return task;
        });
    }

    private Map<String, Object> payload(int version) {
        return new HashMap<>(Map.of("documentVersion", version, "documentTitle", "实际住院记录", "summary", "实际文档摘要",
                "residentId", 4L, "encounterId", 6L, "departmentId", 5L, "actorId", 7L));
    }

    private Map<String, Object> signed(int version) {
        var payload = payload(version); payload.put("signatureTaskRequired", true);
        payload.put("signedAt", signedAt.toString()); payload.put("signatureEvidenceId", 8L); return payload;
    }

    private void project(boolean signed, Map<String, Object> payload) {
        service.projectEncounterEvents(new DomainEventEnvelope(100L, 1L, 2L,
                signed ? "CLINICAL_DOCUMENT_SIGNED" : "CLINICAL_DOCUMENT_READY_FOR_SIGNATURE",
                1, "ClinicalDocument", 3L, 1, 4L, signedAt.plusSeconds(60), Instant.now(),
                "actor", "test", "signature-truth", null, payload, 1));
    }

    @Test void an_old_ready_event_cannot_replace_a_newer_claimed_task() {
        project(false, payload(2));
        stored.get(2).claim(7L);
        project(false, payload(1));
        assertEquals(1, stored.size());
        assertEquals(TaskStatus.IN_PROGRESS, stored.get(2).status());
        assertEquals(7L, stored.get(2).claimedBy());
        assertEquals("待签署：实际住院记录", stored.get(2).title());
    }

    @Test void a_new_version_supersedes_only_older_pending_versions() {
        project(false, payload(1)); project(false, payload(2));
        assertEquals(TaskStatus.CANCELLED, stored.get(1).status());
        assertEquals(TaskStatus.READY, stored.get(2).status());
        project(false, payload(2));
        assertEquals(2, stored.size());
    }

    @Test void signed_before_ready_cannot_reopen_an_already_signed_document() {
        project(true, signed(2)); project(false, payload(2)); project(false, payload(1));
        assertEquals(1, stored.size());
        assertEquals(TaskStatus.COMPLETED, stored.get(2).status());
        assertEquals(signedAt, stored.get(2).completedAt());
    }

    @Test void a_new_signed_version_retires_the_old_pending_version_even_without_a_ready_event() {
        project(false, payload(1)); project(true, signed(2));
        assertEquals(TaskStatus.CANCELLED, stored.get(1).status());
        assertEquals(TaskStatus.COMPLETED, stored.get(2).status());
    }

    @Test void an_old_signature_receipt_does_not_close_a_new_version_and_restores_the_actual_historical_fact() {
        project(false, payload(1)); project(false, payload(2)); project(true, signed(1));
        assertEquals(TaskStatus.COMPLETED, stored.get(1).status());
        assertEquals(signedAt, stored.get(1).completedAt());
        assertEquals(TaskStatus.READY, stored.get(2).status());
    }

    @Test void an_old_signature_can_be_recorded_without_changing_a_newer_task() {
        project(false, payload(3)); project(true, signed(1));
        assertEquals(TaskStatus.READY, stored.get(3).status());
        assertEquals(TaskStatus.COMPLETED, stored.get(1).status());
    }

    @ParameterizedTest @ValueSource(strings = {"signatureTaskRequired", "signedAt", "signatureEvidenceId", "actorId", "residentId", "encounterId", "departmentId", "documentTitle"})
    void missing_signature_facts_do_not_invent_completion(String field) {
        var payload = signed(1); payload.remove(field);
        assertThrows(RuntimeException.class, () -> project(true, payload));
        assertTrue(stored.isEmpty()); verifyNoInteractions(history);
    }

    @Test void a_document_without_an_encounter_does_not_need_a_work_task() {
        project(true, Map.of("documentVersion", 1, "signatureTaskRequired", false));
        verifyNoInteractions(tasks, history);
    }

    @Test void missing_new_version_metadata_does_not_cancel_the_existing_task() {
        project(false, payload(1));
        var payload = payload(2); payload.remove("documentTitle");
        assertThrows(RuntimeException.class, () -> project(false, payload));
        assertEquals(TaskStatus.READY, stored.get(1).status());
        assertEquals(1, stored.size());
    }
}
