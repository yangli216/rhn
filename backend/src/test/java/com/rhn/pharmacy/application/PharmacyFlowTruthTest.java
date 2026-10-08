package com.rhn.pharmacy.application;

import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.outpatient.api.MedicationRequestDirectory.MedicationRequestSnapshot;
import com.rhn.pharmacy.domain.DispenseTask;
import com.rhn.pharmacy.domain.DispenseTaskLine;
import com.rhn.pharmacy.domain.DispenseTaskLineStatus;
import com.rhn.pharmacy.domain.DispenseTaskStatus;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.DispenseTaskRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseLineRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseLineRepository.TaskLineQuantities;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PharmacyFlowTruthTest {
    private final MedicationRequestDirectory requests = mock(MedicationRequestDirectory.class);
    private final DispenseTaskRepository tasks = mock(DispenseTaskRepository.class);
    private final DispenseTaskLineRepository lines = mock(DispenseTaskLineRepository.class);
    private final MedicationDispenseLineRepository movements = mock(MedicationDispenseLineRepository.class);
    private final JpaPharmacyFlowDirectory directory = new JpaPharmacyFlowDirectory(requests, tasks, lines, movements);

    private void request() {
        var request = mock(MedicationRequestSnapshot.class);
        when(request.id()).thenReturn(6L); when(request.tenantId()).thenReturn(1L);
        when(request.residentId()).thenReturn(4L); when(request.encounterId()).thenReturn(5L);
        when(requests.activeForPharmacy(2L)).thenReturn(List.of(request));
    }
    private DispenseTask task(long id, String status) {
        var task = mock(DispenseTask.class);
        when(task.id()).thenReturn(id); when(task.tenantId()).thenReturn(1L);
        when(task.residentId()).thenReturn(4L); when(task.encounterId()).thenReturn(5L);
        when(task.status()).thenReturn(DispenseTaskStatus.valueOf(status)); return task;
    }
    private DispenseTaskLine line(long id, long taskId, String status, String issued, String returned) {
        var line = mock(DispenseTaskLine.class);
        when(line.id()).thenReturn(id); when(line.taskId()).thenReturn(taskId); when(line.requestId()).thenReturn(6L);
        when(line.status()).thenReturn(DispenseTaskLineStatus.valueOf(status));
        when(line.plannedQuantity()).thenReturn(new BigDecimal("2"));
        when(line.dispensedQuantity()).thenReturn(new BigDecimal(issued));
        when(line.returnedQuantity()).thenReturn(new BigDecimal(returned)); return line;
    }
    private TaskLineQuantities evidence(long lineId, String issued, String returned) {
        var value = mock(TaskLineQuantities.class); when(value.getTaskLineId()).thenReturn(lineId);
        when(value.getIssuedQuantity()).thenReturn(new BigDecimal(issued));
        when(value.getReturnedQuantity()).thenReturn(new BigDecimal(returned)); return value;
    }

    @ParameterizedTest
    @CsvSource({
            "COMPLETED,COMPLETED,2,0,2,0,1,0,0,0",
            "COMPLETED,COMPLETED,2,0,0,0,0,1,0,0",
            "COMPLETED,COMPLETED,2,0,1,0,0,1,0,0",
            "COMPLETED,CANCELLED,2,0,2,0,0,1,0,0",
            "COMPLETED,PARTIAL,1,0,1,0,0,1,0,0",
            "RETURNED,RETURNED,2,2,2,2,0,0,1,0",
            "RETURNED,RETURNED,2,2,2,0,0,1,0,0",
            "RETURNED,RETURNED,1,1,1,1,0,1,0,0",
            "PARTIALLY_RETURNED,PARTIAL,2,1,2,1,0,0,0,1",
            "PARTIALLY_RETURNED,PARTIAL,2,1,2,0,0,1,0,0",
            "PARTIALLY_RETURNED,PARTIAL,2,1,2,3,0,1,0,0"
    })
    void terminal_flags_require_actual_quantities_and_returns_remain_distinct(String header, String lineStatus,
            String issued, String returned, String actualIssue, String actualReturn,
            int completed, int exceptions, int fullReturns, int partialReturns) {
        request();
        doReturn(List.of(line(10L, 20L, lineStatus, issued, returned))).when(lines).findByTenantIdAndRequestIdIn(1L, List.of(6L));
        doReturn(List.of(task(20L, header))).when(tasks).findAllById(any());
        doReturn(List.of(evidence(10L, actualIssue, actualReturn))).when(movements).flowQuantities(1L, List.of(10L));
        var result = directory.summarize(1L, 2L, List.of(5L)).get(5L);
        assertEquals(1, result.totalCount()); assertEquals(completed, result.completedCount());
        assertEquals(exceptions, result.exceptionCount()); assertEquals(fullReturns, result.returnedCount());
        assertEquals(partialReturns, result.partiallyReturnedCount());
    }

    @Test
    void absent_issue_rows_cannot_prove_a_completed_header() {
        request();
        doReturn(List.of(line(10L, 20L, "COMPLETED", "2", "0"))).when(lines).findByTenantIdAndRequestIdIn(1L, List.of(6L));
        doReturn(List.of(task(20L, "COMPLETED"))).when(tasks).findAllById(any());
        var result = directory.summarize(1L, 2L, List.of(5L)).get(5L);
        assertEquals(0, result.completedCount()); assertEquals(1, result.exceptionCount());
    }

    @Test
    void a_missing_task_is_not_dropped_when_another_task_is_completed() {
        request();
        doReturn(List.of(
                line(10L, 20L, "COMPLETED", "2", "0"), line(11L, 21L, "PENDING", "0", "0"))).when(lines).findByTenantIdAndRequestIdIn(1L, List.of(6L));
        doReturn(List.of(task(20L, "COMPLETED"))).when(tasks).findAllById(any());
        doReturn(List.of(evidence(10L, "2", "0"))).when(movements).flowQuantities(1L, List.of(10L, 11L));
        var result = directory.summarize(1L, 2L, List.of(5L)).get(5L);
        assertEquals(0, result.completedCount()); assertEquals(1, result.exceptionCount());
    }

    @ParameterizedTest
    @CsvSource({"PENDING_REVIEW,PENDING,1,0,0", "READY_TO_PICK,READY,1,0,0", "PICKING,PICKING,0,1,0",
            "READY_TO_DISPENSE,READY_TO_DISPENSE,0,1,0", "PARTIALLY_DISPENSED,PARTIAL,0,1,0",
            "INTERVENTION,PENDING,0,0,1", "REJECTED,CANCELLED,0,0,1", "CANCELLED,CANCELLED,0,0,1"})
    void nonterminal_work_is_never_reported_as_completed(String header, String lineStatus, int waiting, int progress, int exceptions) {
        request();
        doReturn(List.of(line(10L, 20L, lineStatus, "0", "0"))).when(lines).findByTenantIdAndRequestIdIn(1L, List.of(6L));
        doReturn(List.of(task(20L, header))).when(tasks).findAllById(any());
        var result = directory.summarize(1L, 2L, List.of(5L)).get(5L);
        assertEquals(0, result.completedCount()); assertEquals(waiting, result.waitingCount());
        assertEquals(progress, result.inProgressCount()); assertEquals(exceptions, result.exceptionCount());
    }

    @Test
    void not_yet_intaken_request_stays_waiting() {
        request();
        var result = directory.summarize(1L, 2L, List.of(5L)).get(5L);
        assertEquals(1, result.waitingCount()); assertEquals(0, result.completedCount()); verifyNoInteractions(movements);
    }
}
