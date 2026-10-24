package com.rhn.treatment.domain;

import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class TreatmentExceptionResolutionTest {
    private final Instant start = Instant.parse("2026-10-03T00:00:00Z");

    private TreatmentExecutionTask startedTask() {
        var task = new TreatmentExecutionTask(1L, 2L, 3L, 4L, 5L, 6L, "SERVICE", start, "TEST-TreatmentExecutionTask");
        task.synchronize(true, true, true, true, false, null);
        task.start(0, true, "CARD", "治疗室", "起始说明", 7L, start);
        return task;
    }

    private TreatmentExecutionTask interrupted() {
        var task = startedTask();
        task.complete(0, "INTERRUPTED", "患者要求停止", false, null, 7L, start.plusSeconds(60));
        return task;
    }

    private TreatmentExecutionTask withReaction() {
        var task = startedTask();
        task.complete(0, "COMPLETED", null, true, "出现皮疹，已通知医生", 7L, start.plusSeconds(60));
        return task;
    }

    private String code(Runnable action) {
        return assertThrows(BusinessException.class, action::run).code();
    }

    @Test void requeue_keeps_started_at_clears_the_round_and_re_derives_gates() {
        var task = interrupted();
        long revision = task.revision();
        assertEquals(TreatmentExecutionTaskStatus.EXCEPTION, task.status());
        assertEquals(List.of("REQUEUE", "CLOSE"), task.allowedResolutions());

        var previous = task.resolve(revision, "REQUEUE", "已与患者沟通，择时重做", 8L, start.plusSeconds(120));
        task.synchronize(true, true, true, true, false, null);

        assertEquals(TreatmentExecutionTaskStatus.READY, task.status());
        assertEquals(start, task.startedAt());
        assertNull(task.completedAt()); assertNull(task.completedBy()); assertNull(task.resultCode());
        assertNull(task.completionNote()); assertNull(task.adverseReaction()); assertNull(task.exceptionNote());
        assertTrue(task.hasStarted());
        assertEquals("INTERRUPTED", previous.resultCode());
        assertEquals("EXCEPTION", previous.status());
        assertEquals(start.plusSeconds(60), previous.completedAt());
        assertEquals("患者要求停止", previous.completionNote());
        // 重新开始并完成后回到正常终态
        task.start(task.revision(), true, "MANUAL", null, null, 9L, start.plusSeconds(300));
        task.complete(task.revision(), "COMPLETED", null, false, null, 9L, start.plusSeconds(360));
        assertEquals(TreatmentExecutionTaskStatus.COMPLETED, task.status());
        assertEquals(TreatmentExecutionTaskStatus.COMPLETED, task.verifiedStatus());
    }

    @Test void requeue_returns_to_the_gate_that_is_currently_unmet() {
        var task = interrupted();
        task.resolve(0, "REQUEUE", "重新执行", 8L, start);
        task.synchronize(true, false, false, true, false, "未结算");
        assertEquals(TreatmentExecutionTaskStatus.WAITING_SETTLEMENT, task.status());
        assertTrue(task.hasStarted());

        var dispense = interrupted();
        dispense.resolve(0, "REQUEUE", "重新执行", 8L, start);
        dispense.synchronize(true, true, false, true, false, "未发药");
        assertEquals(TreatmentExecutionTaskStatus.WAITING_DISPENSE, dispense.status());

        var skin = interrupted();
        skin.resolve(0, "REQUEUE", "重新执行", 8L, start);
        skin.synchronize(true, true, true, false, false, "待皮试");
        assertEquals(TreatmentExecutionTaskStatus.WAITING_SKIN_TEST, skin.status());
    }

    @Test void gate_exception_during_execution_can_be_requeued() {
        var task = startedTask();
        task.synchronize(true, false, true, true, false, "治疗相关费用已撤销或尚未结算，请暂停执行并核对");
        assertEquals(TreatmentExecutionTaskStatus.EXCEPTION, task.status());
        assertNull(task.adverseReaction());
        assertEquals(List.of("REQUEUE", "CLOSE"), task.allowedResolutions());
        task.resolve(0, "REQUEUE", "费用已重新结算", 8L, start);
        task.synchronize(true, true, true, true, false, null);
        assertEquals(TreatmentExecutionTaskStatus.READY, task.status());
        assertEquals(start, task.startedAt());
    }

    @Test void adverse_reaction_exception_cannot_be_requeued_but_can_be_closed() {
        var task = withReaction();
        assertEquals(List.of("CLOSE"), task.allowedResolutions());
        assertEquals("TREATMENT_REQUEUE_NOT_ALLOWED", code(() -> task.resolve(0, "REQUEUE", "重做", 8L, start)));
        assertEquals(TreatmentExecutionTaskStatus.EXCEPTION, task.status());

        var previous = task.resolve(0, "CLOSE", "已随访，患者恢复，不再执行", 8L, start.plusSeconds(600));
        assertEquals(TreatmentExecutionTaskStatus.CLOSED, task.status());
        assertTrue(task.status().terminal());
        assertEquals("已随访，患者恢复，不再执行", task.exceptionNote());
        assertEquals(start.plusSeconds(600), task.completedAt());
        assertEquals(8L, task.completedBy());
        // 原不良反应记录保留，处置前的完成人/时间由事件留痕
        assertEquals(Boolean.TRUE, task.adverseReaction());
        assertEquals("出现皮疹，已通知医生", task.adverseReactionDetail());
        assertEquals(7L, previous.completedBy());
        assertEquals(start.plusSeconds(60), previous.completedAt());
        assertTrue(task.hasStarted());
        assertEquals(TreatmentExecutionTaskStatus.CLOSED, task.verifiedStatus());
        assertTrue(task.allowedResolutions().isEmpty());
    }

    @Test void closed_is_terminal_and_not_changed_by_synchronize() {
        var task = interrupted();
        task.resolve(0, "CLOSE", "确认不再执行", 8L, start);
        task.synchronize(true, false, false, false, true, "任何门禁");
        assertEquals(TreatmentExecutionTaskStatus.CLOSED, task.status());
        task.synchronize(false, true, true, true, false, null);
        assertEquals(TreatmentExecutionTaskStatus.CLOSED, task.status());
    }

    @Test void skin_test_positive_exception_cannot_be_requeued_or_closed() {
        var task = new TreatmentExecutionTask(1L, 2L, 3L, 4L, 5L, 6L, "MEDICATION", start, "TEST-TreatmentExecutionTask");
        task.synchronize(true, true, true, false, true, "");
        assertEquals(TreatmentExecutionTaskStatus.EXCEPTION, task.status());
        assertTrue(task.skinTestException());
        assertTrue(task.allowedResolutions().isEmpty());
        assertEquals("TREATMENT_REQUEUE_NOT_ALLOWED", code(() -> task.resolve(0, "REQUEUE", "重做", 8L, start)));
        assertEquals("TREATMENT_CLOSE_NOT_ALLOWED", code(() -> task.resolve(0, "CLOSE", "关闭", 8L, start)));
        assertEquals(TreatmentExecutionTaskStatus.EXCEPTION, task.status());
        // 现有对该类异常的自动处理不变：阳性解除后按门禁回到待执行
        task.synchronize(true, true, true, true, false, "");
        assertEquals(TreatmentExecutionTaskStatus.READY, task.status());
        assertFalse(task.hasStarted());
    }

    @Test void resolve_validates_state_note_resolution_and_revision() {
        var started = startedTask();
        assertEquals("TREATMENT_RESOLVE_STATE_INVALID", code(() -> started.resolve(0, "CLOSE", "说明", 8L, start)));
        var task = interrupted();
        assertEquals("TREATMENT_TASK_REVISION_CONFLICT", code(() -> task.resolve(99, "CLOSE", "说明", 8L, start)));
        assertEquals("TREATMENT_RESOLVE_NOTE_REQUIRED", code(() -> task.resolve(0, "CLOSE", "  ", 8L, start)));
        assertEquals("TREATMENT_RESOLVE_NOTE_REQUIRED", code(() -> task.resolve(0, "REQUEUE", null, 8L, start)));
        assertEquals("TREATMENT_RESOLUTION_INVALID", code(() -> task.resolve(0, "DELETE", "说明", 8L, start)));
        assertEquals("TREATMENT_RESOLUTION_INVALID", code(() -> task.resolve(0, null, "说明", 8L, start)));
        assertEquals("TREATMENT_RESOLVE_NOTE_TOO_LONG",
                code(() -> task.resolve(0, "CLOSE", "x".repeat(1001), 8L, start)));
        assertEquals(TreatmentExecutionTaskStatus.EXCEPTION, task.status());
        var completed = startedTask();
        completed.complete(0, "COMPLETED", null, false, null, 7L, start);
        assertEquals("TREATMENT_RESOLVE_STATE_INVALID", code(() -> completed.resolve(0, "CLOSE", "说明", 8L, start)));
        assertTrue(completed.allowedResolutions().isEmpty());
    }

    @Test void has_started_follows_the_protection_rule_for_every_status() {
        for (var status : TreatmentExecutionTaskStatus.values()) {
            var task = startedTask();
            org.springframework.test.util.ReflectionTestUtils.setField(task, "status", status);
            assertEquals(status != TreatmentExecutionTaskStatus.CANCELLED, task.hasStarted(), status.name());
        }
        var neverStarted = new TreatmentExecutionTask(1L, 2L, 3L, 4L, 5L, 6L, "SERVICE", start, "TEST-TreatmentExecutionTask");
        neverStarted.synchronize(true, true, true, true, false, null);
        assertFalse(neverStarted.hasStarted());
    }
}
