package com.rhn.treatment.application;

import com.rhn.treatment.domain.TreatmentExecutionTask;
import com.rhn.treatment.domain.TreatmentExecutionTaskStatus;
import com.rhn.treatment.infrastructure.TreatmentExecutionTaskRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class TreatmentFlowTruthTest {
    private final TreatmentExecutionTaskRepository tasks = mock(TreatmentExecutionTaskRepository.class);
    private final JpaTreatmentFlowDirectory directory = new JpaTreatmentFlowDirectory(tasks);
    private final Instant start = Instant.parse("2026-10-03T00:00:00Z");

    private TreatmentExecutionTask completed() {
        var task = new TreatmentExecutionTask(1L, 2L, 3L, 4L, 5L, 6L, "SERVICE", start);
        task.synchronize(true, true, true, true, false, null);
        task.start(0, true, "CARD", null, null, 7L, start);
        task.complete(0, "COMPLETED", null, false, null, 7L, start.plusSeconds(60));
        return task;
    }

    @ParameterizedTest
    @EnumSource(TreatmentExecutionTaskStatus.class)
    void every_status_has_an_explicit_nonoptimistic_summary(TreatmentExecutionTaskStatus status) {
        var task = completed(); ReflectionTestUtils.setField(task, "status", status);
        when(tasks.findByTenantIdAndEncounterIdIn(1L, List.of(5L))).thenReturn(List.of(task));
        var result = directory.summarize(1L, List.of(5L));
        if (status == TreatmentExecutionTaskStatus.CANCELLED) { assertTrue(result.isEmpty()); return; }
        var summary = result.get(5L);
        assertEquals(1, summary.totalCount());
        assertEquals(status == TreatmentExecutionTaskStatus.COMPLETED ? 1 : 0, summary.completedCount());
        assertEquals(status == TreatmentExecutionTaskStatus.WAITING_SKIN_TEST || status == TreatmentExecutionTaskStatus.READY ? 1 : 0,
                summary.waitingCount());
        assertEquals(status == TreatmentExecutionTaskStatus.WAITING_SETTLEMENT ? 1 : 0, summary.settlementBlockedCount());
        assertEquals(status == TreatmentExecutionTaskStatus.WAITING_DISPENSE ? 1 : 0, summary.dispenseBlockedCount());
        assertEquals(status == TreatmentExecutionTaskStatus.IN_PROGRESS ? 1 : 0, summary.inProgressCount());
        assertEquals(status == TreatmentExecutionTaskStatus.EXCEPTION ? 1 : 0, summary.exceptionCount());
    }

    @ParameterizedTest
    @ValueSource(strings = {"startedAt", "startedBy", "completedAt", "completedBy", "verificationMethod", "resultCode", "adverseReaction"})
    void each_required_completion_fact_must_be_present(String field) {
        var task = completed(); ReflectionTestUtils.setField(task, field, null);
        when(tasks.findByTenantIdAndEncounterIdIn(1L, List.of(5L))).thenReturn(List.of(task));
        var summary = directory.summarize(1L, List.of(5L)).get(5L);
        assertEquals(0, summary.completedCount()); assertEquals(1, summary.exceptionCount());
        assertEquals(TreatmentExecutionTaskStatus.EXCEPTION, task.verifiedStatus());
        assertEquals(TreatmentExecutionTaskStatus.COMPLETED, task.status()); // Read validation preserves historical records.
    }

    @ParameterizedTest
    @ValueSource(strings = {"chronology", "verification", "result", "reaction", "reactionDetail"})
    void contradictory_facts_do_not_prove_successful_treatment(String problem) {
        var task = completed();
        switch (problem) {
            case "chronology" -> ReflectionTestUtils.setField(task, "completedAt", start.minusSeconds(1));
            case "verification" -> ReflectionTestUtils.setField(task, "verificationMethod", "UNKNOWN");
            case "result" -> ReflectionTestUtils.setField(task, "resultCode", "INTERRUPTED");
            case "reaction" -> ReflectionTestUtils.setField(task, "adverseReaction", true);
            case "reactionDetail" -> ReflectionTestUtils.setField(task, "adverseReactionDetail", "发生皮疹");
        }
        assertEquals(TreatmentExecutionTaskStatus.EXCEPTION, task.verifiedStatus());
    }

    @Test
    void cancelled_tasks_do_not_inflate_completed_counts_in_a_mixed_encounter() {
        var cancelled = completed(); ReflectionTestUtils.setField(cancelled, "status", TreatmentExecutionTaskStatus.CANCELLED);
        when(tasks.findByTenantIdAndEncounterIdIn(1L, List.of(5L))).thenReturn(List.of(cancelled, completed()));
        var summary = directory.summarize(1L, List.of(5L)).get(5L);
        assertEquals(1, summary.totalCount()); assertEquals(1, summary.completedCount());
    }
}
