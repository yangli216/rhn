package com.rhn.treatment.application;

import com.rhn.outpatient.api.OrderFulfillmentGuard.OrderRef;
import com.rhn.treatment.domain.TreatmentExecutionItem;
import com.rhn.treatment.domain.TreatmentExecutionTask;
import com.rhn.treatment.domain.TreatmentExecutionTaskStatus;
import com.rhn.treatment.infrastructure.TreatmentExecutionItemRepository;
import com.rhn.treatment.infrastructure.TreatmentExecutionTaskRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 退费预检与撤销医嘱保护共用「执行已开始」口径，且按真实来源类型（SERVICE_REQUEST / MEDICATION_REQUEST）定位。 */
class TreatmentStartedProtectionTest {
    private final TreatmentExecutionItemRepository items = mock(TreatmentExecutionItemRepository.class);
    private final TreatmentExecutionTaskRepository tasks = mock(TreatmentExecutionTaskRepository.class);
    private final RefundTreatmentDirectoryService refunds = new RefundTreatmentDirectoryService(items, tasks);
    private final TreatmentOrderFulfillmentGuard guard = new TreatmentOrderFulfillmentGuard(items, tasks);
    private final Instant at = Instant.parse("2026-10-03T00:00:00Z");

    private TreatmentExecutionTask task(TreatmentExecutionTaskStatus status, boolean started) {
        var task = new TreatmentExecutionTask(1L, 2L, 3L, 4L, 5L, 6L, "SERVICE", at, "TEST-TreatmentExecutionTask");
        ReflectionTestUtils.setField(task, "status", status);
        if (started) ReflectionTestUtils.setField(task, "startedAt", at);
        return task;
    }

    private TreatmentExecutionItem item(String sourceType, boolean cancelled) {
        var item = new TreatmentExecutionItem(1L, 77L, sourceType, 900L, null, "R-1", "CODE", "治疗", null, null, null,
                null, null, null, null, null, null, false, false, false, at);
        if (cancelled) item.cancel(at);
        return item;
    }

    private void seed(String sourceType, TreatmentExecutionTask task, boolean cancelledItem) {
        var item = item(sourceType, cancelledItem);
        when(items.findByTenantIdAndSourceTypeAndSourceId(1L, sourceType, 900L)).thenReturn(Optional.of(item));
        when(items.lockBySource(1L, sourceType, 900L)).thenReturn(Optional.of(item));
        when(tasks.findById(77L)).thenReturn(Optional.of(task));
    }

    @Test void started_in_progress_completed_and_started_exception_tasks_count_as_executed() {
        for (var status : new TreatmentExecutionTaskStatus[] {TreatmentExecutionTaskStatus.IN_PROGRESS,
                TreatmentExecutionTaskStatus.COMPLETED, TreatmentExecutionTaskStatus.EXCEPTION,
                TreatmentExecutionTaskStatus.CLOSED, TreatmentExecutionTaskStatus.READY}) {
            seed("SERVICE_REQUEST", task(status, true), false);
            assertTrue(refunds.isExecutedOrInProgress(1L, "SERVICE_REQUEST", 900L), status.name());
            var order = OrderRef.service(1L, 900L, "TREATMENT");
            assertNotNull(guard.cancelBlockedReason(order, false), status.name());
            assertNotNull(guard.cancelBlockedReason(order, true), status.name());
        }
    }

    @Test void never_started_or_cancelled_tasks_do_not_block() {
        for (var status : new TreatmentExecutionTaskStatus[] {TreatmentExecutionTaskStatus.WAITING_SETTLEMENT,
                TreatmentExecutionTaskStatus.WAITING_DISPENSE, TreatmentExecutionTaskStatus.WAITING_SKIN_TEST,
                TreatmentExecutionTaskStatus.READY, TreatmentExecutionTaskStatus.EXCEPTION}) {
            seed("MEDICATION_REQUEST", task(status, false), false);
            assertFalse(refunds.isExecutedOrInProgress(1L, "MEDICATION_REQUEST", 900L), status.name());
            assertNull(guard.cancelBlockedReason(OrderRef.medication(1L, 900L), false), status.name());
        }
        seed("MEDICATION_REQUEST", task(TreatmentExecutionTaskStatus.CANCELLED, true), false);
        assertFalse(refunds.isExecutedOrInProgress(1L, "MEDICATION_REQUEST", 900L));
    }

    @Test void cancelled_item_and_missing_execution_do_not_block_and_source_type_is_respected() {
        seed("SERVICE_REQUEST", task(TreatmentExecutionTaskStatus.COMPLETED, true), true);
        assertFalse(refunds.isExecutedOrInProgress(1L, "SERVICE_REQUEST", 900L));
        assertFalse(refunds.isExecutedOrInProgress(1L, "TREATMENT", 900L), "legacy TREATMENT source type has no items");
        assertFalse(refunds.isExecutedOrInProgress(1L, "SERVICE_REQUEST", null));
        assertFalse(refunds.isExecutedOrInProgress(1L, null, 900L));
        assertFalse(refunds.isExecutedOrInProgress(1L, "SERVICE_REQUEST", 12345L));
    }
}
