package com.rhn.healthplanning.domain;

import org.junit.jupiter.api.Test;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;

class CareTaskUrgencyTest {
    private CareTask task(Instant due) {
        return CareTask.hypertensionRecheck(1L, 2L, 3L, 4L, "HTN:4", 5L, 6L,
                CareTaskPriority.HIGH, due, "普通复查", "原说明", 7L, 8L);
    }

    @Test void urgent_evidence_tightens_the_deadline_and_repeats_do_not_postpone_it() {
        Instant now = Instant.parse("2026-10-03T00:00:00Z");
        CareTask task = task(now.plusSeconds(28 * 86400));
        assertTrue(task.raiseUrgency(now, "立即复测", "紧急说明"));
        assertEquals(CareTaskPriority.URGENT, task.priority());
        assertEquals(now, task.dueAt());
        assertEquals("立即复测", task.title());
        assertFalse(task.raiseUrgency(now.plusSeconds(60), "后续标题", "后续说明"));
        assertEquals(now, task.dueAt());
        assertEquals("立即复测", task.title());
    }

    @Test void urgency_never_relaxes_an_already_overdue_task() {
        Instant earlier = Instant.parse("2026-10-01T00:00:00Z");
        CareTask task = task(earlier);
        assertTrue(task.raiseUrgency(earlier.plusSeconds(86400), "立即复测", "紧急说明"));
        assertEquals(CareTaskPriority.URGENT, task.priority());
        assertEquals(earlier, task.dueAt());
    }

    @Test void earlier_urgent_evidence_can_tighten_an_urgent_deadline() {
        Instant now = Instant.parse("2026-10-03T00:00:00Z");
        CareTask task = task(now.plusSeconds(86400));
        task.raiseUrgency(now, "立即复测", "紧急说明");
        assertTrue(task.raiseUrgency(now.minusSeconds(60), "立即复测", "紧急说明"));
        assertEquals(now.minusSeconds(60), task.dueAt());
    }
}
