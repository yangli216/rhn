package com.rhn;

import com.rhn.pharmacy.domain.DispenseTask;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PrescriptionReviewStateTest {
    @Test
    void disabledReviewStartsDispensingWithoutCreatingAFakeReview() {
        DispenseTask task = task();

        task.bypassPreDispenseReview();

        assertEquals("READY_TO_PICK", task.status());
        assertNull(task.latestReviewId());
    }

    @Test
    void postDispenseReviewPreservesCompletedDispenseState() {
        DispenseTask task = task();
        task.bypassPreDispenseReview();
        task.markReserved();
        task.completePicking(11L, 12L, 13L, "复核完成");
        task.recordDispense(true);

        task.recordPostDispenseReview(99L);

        assertEquals("COMPLETED", task.status());
        assertEquals(99L, task.latestReviewId());
        assertThrows(RuntimeException.class, () -> task.recordPostDispenseReview(100L));
    }

    private DispenseTask task() {
        return new DispenseTask(1L, 2L, 3L, 4L, "DT-TEST", "OUTPATIENT", "ROUTINE", null);
    }
}
