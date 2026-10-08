package com.rhn.diagnostics.application;

import com.rhn.billing.api.SettlementAuthorizationDirectory;
import com.rhn.diagnostics.domain.DiagnosticExecutionTask;
import com.rhn.diagnostics.domain.DiagnosticExecutionTaskStatus;
import com.rhn.diagnostics.domain.DiagnosticReport;
import com.rhn.diagnostics.infrastructure.DiagnosticExecutionTaskRepository;
import com.rhn.diagnostics.infrastructure.DiagnosticReportRepository;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.ServiceRequestDirectory;
import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.api.IdempotentDomainEventConsumer;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DiagnosticReportTruthTest {
    private final DiagnosticExecutionTaskRepository tasks = mock(DiagnosticExecutionTaskRepository.class);
    private final DiagnosticReportRepository reports = mock(DiagnosticReportRepository.class);
    private final IdempotentDomainEventConsumer consumer = mock(IdempotentDomainEventConsumer.class);
    private final DiagnosticExecutionService service = new DiagnosticExecutionService(tasks, reports,
            mock(ServiceRequestDirectory.class), mock(ResidentDirectory.class), mock(SettlementAuthorizationDirectory.class),
            mock(ExecutionContextProvider.class), consumer, false);
    private final DiagnosticExecutionTask task = new DiagnosticExecutionTask(1L, 2L, 3L, 4L, 5L, 6L,
            "REQ-1", "LABORATORY", "LAB", "检验", "BLOOD", null, false, Instant.now());

    private DiagnosticReport report(String status, int version) {
        return new DiagnosticReport(1L, 4L, 5L, 6L, 2L, 3L, "LIS", "REPORT-1", version,
                null, "LABORATORY", status, "LAB", "实际报告", Instant.parse("2026-08-27T00:00:00Z"),
                "实际结论", "LAB-1", "检验医师", "digest", 100L, 7L);
    }

    private void projection(Map<String, Object> payload) {
        when(tasks.lockByTenantIdAndRequestId(1L, 6L)).thenReturn(Optional.of(task));
        when(consumer.consume(anyString(), any(), any())).thenAnswer(invocation -> {
            invocation.<Runnable>getArgument(2).run(); return true;
        });
        service.project(new DomainEventEnvelope(200L, 1L, 2L, "DIAGNOSTIC_REPORT_RECEIVED", 1,
                "ServiceRequest", 6L, 0L, 4L, Instant.parse("2020-01-01T00:00:00Z"), Instant.now(),
                "actor", "test", "correlation", null, payload, 1));
    }

    @ParameterizedTest
    @CsvSource({"PRELIMINARY,IN_PROGRESS", "FINAL,COMPLETED", "CORRECTED,COMPLETED", "CANCELLED,EXCEPTION"})
    void persisted_report_determines_status_actor_and_time_instead_of_event_payload(String status, String expected) {
        DiagnosticReport report = report(status, 1);
        when(reports.findByIdAndTenantId(report.id(), 1L)).thenReturn(Optional.of(report));
        when(reports.findTopByTenantIdAndRequestIdOrderByReceivedAtDescIdDesc(1L, 6L)).thenReturn(Optional.of(report));
        projection(Map.of("reportId", report.id(), "reportStatus", "FINAL", "receivedBy", 999L, "reportName", "虚构完成"));
        assertEquals(DiagnosticExecutionTaskStatus.valueOf(expected), task.status());
        assertEquals(report.id(), task.reportId());
        if (task.status() == DiagnosticExecutionTaskStatus.COMPLETED) {
            assertEquals(report.createdBy(), task.completedBy());
            assertEquals(report.receivedAt(), task.completedAt());
            assertEquals(report.reportName(), task.completionNote());
        } else assertNull(task.completedAt());
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void missing_report_evidence_never_completes_task(boolean hasReference) {
        assertThrows(BusinessException.class, () -> projection(hasReference
                ? Map.of("reportId", 999L, "reportStatus", "FINAL") : Map.of("reportStatus", "FINAL")));
        assertEquals(DiagnosticExecutionTaskStatus.READY, task.status());
        assertNull(task.reportId());
    }

    @Test
    void replay_of_final_event_keeps_latest_cancellation_and_clears_completion_fields() {
        DiagnosticReport finalReport = report("FINAL", 1);
        task.recordReport(finalReport);
        DiagnosticReport cancelled = report("CANCELLED", 2);
        when(reports.findByIdAndTenantId(finalReport.id(), 1L)).thenReturn(Optional.of(finalReport));
        when(reports.findTopByTenantIdAndRequestIdOrderByReceivedAtDescIdDesc(1L, 6L)).thenReturn(Optional.of(cancelled));
        projection(Map.of("reportId", finalReport.id(), "reportStatus", "FINAL"));
        assertEquals(DiagnosticExecutionTaskStatus.EXCEPTION, task.status());
        assertEquals(cancelled.id(), task.reportId());
        assertNull(task.completedAt()); assertNull(task.completedBy()); assertNull(task.completionNote());
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "UNKNOWN", "SUCCEEDED"})
    void unknown_report_status_cannot_fall_through_to_completed(String status) {
        assertThrows(BusinessException.class, () -> task.recordReport(report(status, 1)));
        assertEquals(DiagnosticExecutionTaskStatus.READY, task.status());
        assertNull(task.reportId());
    }

    @ParameterizedTest
    @ValueSource(strings = {"tenant", "resident", "encounter", "request", "organization", "department", "type"})
    void report_ownership_and_type_must_match_task(String mismatch) {
        DiagnosticReport other = new DiagnosticReport(mismatch.equals("tenant") ? 99L : 1L,
                mismatch.equals("resident") ? 99L : 4L, mismatch.equals("encounter") ? 99L : 5L,
                mismatch.equals("request") ? 99L : 6L, mismatch.equals("organization") ? 99L : 2L,
                mismatch.equals("department") ? 99L : 3L, "LIS", "OTHER", 1, null,
                mismatch.equals("type") ? "IMAGING" : "LABORATORY", "FINAL", "LAB", "报告", Instant.now(),
                "结论", "LAB-1", "医师", "digest", 100L, 7L);
        assertThrows(BusinessException.class, () -> task.recordReport(other));
        assertEquals(DiagnosticExecutionTaskStatus.READY, task.status());
        assertNull(task.reportId());
    }

    @Test
    void event_cannot_reference_another_request_even_if_this_request_has_valid_report() {
        DiagnosticReport other = mock(DiagnosticReport.class);
        when(other.requestId()).thenReturn(99L);
        when(reports.findByIdAndTenantId(88L, 1L)).thenReturn(Optional.of(other));
        assertThrows(BusinessException.class, () -> projection(Map.of("reportId", 88L, "reportStatus", "FINAL")));
        assertEquals(DiagnosticExecutionTaskStatus.READY, task.status());
        verify(reports, never()).findTopByTenantIdAndRequestIdOrderByReceivedAtDescIdDesc(anyLong(), anyLong());
    }
}
