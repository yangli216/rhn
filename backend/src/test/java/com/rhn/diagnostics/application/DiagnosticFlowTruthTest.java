package com.rhn.diagnostics.application;

import com.rhn.diagnostics.domain.DiagnosticExecutionTask;
import com.rhn.diagnostics.domain.DiagnosticReport;
import com.rhn.diagnostics.infrastructure.DiagnosticExecutionTaskRepository;
import com.rhn.diagnostics.infrastructure.DiagnosticReportRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DiagnosticFlowTruthTest {
    private final DiagnosticExecutionTaskRepository tasks = mock(DiagnosticExecutionTaskRepository.class);
    private final DiagnosticReportRepository reports = mock(DiagnosticReportRepository.class);
    private final JpaDiagnosticFlowDirectory directory = new JpaDiagnosticFlowDirectory(tasks, reports);

    private DiagnosticExecutionTask task(long request) {
        return new DiagnosticExecutionTask(1L, 2L, 3L, 4L, 5L, request, "REQ-" + request,
                "LABORATORY", "LAB", "检验", "BLOOD", null, false, Instant.now());
    }
    private DiagnosticReport report(String status, int version) {
        return new DiagnosticReport(1L, 4L, 5L, 6L, 2L, 3L, "LIS", "REPORT", version, null,
                "LABORATORY", status, "LAB", "报告", Instant.now(), "结论", "LAB", "医师", "digest", 100L, 7L);
    }

    @Test
    void cancelled_task_is_not_a_completed_diagnostic_stage() {
        var task = task(6L); task.cancel(Instant.now());
        when(tasks.findByTenantIdAndEncounterIdIn(1L, List.of(5L))).thenReturn(List.of(task));
        assertTrue(directory.summarize(1L, List.of(5L)).isEmpty());
        verifyNoInteractions(reports);
    }

    @Test
    void only_actual_completed_work_counts_when_cancelled_and_completed_tasks_coexist() {
        var cancelled = task(8L); cancelled.cancel(Instant.now());
        var completed = task(6L); var report = report("FINAL", 1); completed.recordReport(report);
        when(tasks.findByTenantIdAndEncounterIdIn(1L, List.of(5L))).thenReturn(List.of(cancelled, completed));
        when(reports.findByTenantIdAndRequestIdInOrderByReceivedAtDescIdDesc(1L, List.of(6L))).thenReturn(List.of(report));
        var result = directory.summarize(1L, List.of(5L)).get(5L);
        assertEquals(1, result.totalCount()); assertEquals(1, result.completedCount()); assertEquals(0, result.exceptionCount());
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing", "CANCELLED", "PRELIMINARY", "CORRECTED"})
    void completion_flag_requires_matching_latest_final_report(String state) {
        var task = task(6L); var old = report("FINAL", 1); task.recordReport(old);
        when(tasks.findByTenantIdAndEncounterIdIn(1L, List.of(5L))).thenReturn(List.of(task));
        when(reports.findByTenantIdAndRequestIdInOrderByReceivedAtDescIdDesc(1L, List.of(6L)))
                .thenReturn(state.equals("missing") ? List.of() : List.of(report(state, 2), old));
        var result = directory.summarize(1L, List.of(5L)).get(5L);
        assertEquals(1, result.totalCount()); assertEquals(0, result.completedCount()); assertEquals(1, result.exceptionCount());
    }
}
