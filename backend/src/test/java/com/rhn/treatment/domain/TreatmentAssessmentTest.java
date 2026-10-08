package com.rhn.treatment.domain;

import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;

class TreatmentAssessmentTest {
    private TreatmentExecutionTask readyTask() {
        var task = new TreatmentExecutionTask(1L, 2L, 3L, 4L, 5L, 6L, "SERVICE", Instant.now());
        task.synchronize(true, true, true, true, false, null);
        return task;
    }

    private TreatmentExecutionTask startedTask() {
        var task = readyTask();
        task.start(0, true, "CARD", null, null, 7L, Instant.now());
        return task;
    }

    @Test void unassessed_tasks_remain_unknown() {
        var task = startedTask();
        assertNull(task.resultCode());
        assertNull(task.adverseReaction());
        assertNull(task.executionSite());
    }

    @Test void start_does_not_invent_a_verification_method() {
        var task = readyTask();
        assertEquals("TREATMENT_VERIFICATION_METHOD_REQUIRED", assertThrows(BusinessException.class,
                () -> task.start(0, true, null, null, null, 7L, Instant.now())).code());
        assertEquals(TreatmentExecutionTaskStatus.READY, task.status());
        assertNull(task.verificationMethod());
    }

    @Test void completion_requires_both_actual_assessments() {
        var task = startedTask();
        assertEquals("TREATMENT_RESULT_REQUIRED", assertThrows(BusinessException.class,
                () -> task.complete(0, null, null, false, null, 7L, Instant.now())).code());
        assertEquals("TREATMENT_ADVERSE_REACTION_REQUIRED", assertThrows(BusinessException.class,
                () -> task.complete(0, "COMPLETED", null, null, null, 7L, Instant.now())).code());
        assertEquals(TreatmentExecutionTaskStatus.IN_PROGRESS, task.status());
        assertNull(task.completedAt());
        assertNull(task.adverseReaction());
    }

    @Test void explicit_no_reaction_can_complete() {
        var task = startedTask();
        task.complete(0, "COMPLETED", "人工确认治疗结束", false, null, 7L, Instant.now());
        assertEquals(TreatmentExecutionTaskStatus.COMPLETED, task.status());
        assertEquals(Boolean.FALSE, task.adverseReaction());
    }

    @Test void reaction_requires_details_and_is_not_a_successful_completion() {
        var task = startedTask();
        assertEquals("TREATMENT_ADVERSE_REACTION_DETAIL_REQUIRED", assertThrows(BusinessException.class,
                () -> task.complete(0, "COMPLETED", null, true, null, 7L, Instant.now())).code());
        task.complete(0, "INTERRUPTED", null, true, "出现皮疹，已停止治疗并通知医生", 7L, Instant.now());
        assertEquals(TreatmentExecutionTaskStatus.EXCEPTION, task.status());
        assertEquals(Boolean.TRUE, task.adverseReaction());
    }

    @Test void inconsistent_reaction_assessment_is_rejected() {
        var task = startedTask();
        assertEquals("TREATMENT_ADVERSE_REACTION_INCONSISTENT", assertThrows(BusinessException.class,
                () -> task.complete(0, "COMPLETED", null, false, "发生皮疹", 7L, Instant.now())).code());
        assertNull(task.completedAt());
    }
}
