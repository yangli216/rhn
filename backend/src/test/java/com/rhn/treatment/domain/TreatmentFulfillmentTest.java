package com.rhn.treatment.domain;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;

class TreatmentFulfillmentTest {
    private TreatmentExecutionItem item(boolean required) {
        return new TreatmentExecutionItem(1L, 2L, "MEDICATION_REQUEST", 3L, null, "MR-1", "DRUG", "治疗用药",
                null, null, null, null, null, null, null, null, null, false, false, required, Instant.now());
    }

    @ParameterizedTest @NullSource
    @ValueSource(strings = {"PENDING", "PARTIAL", "RETURNED", "CANCELLED", "UNKNOWN"})
    void a_document_without_confirmed_completion_never_releases_treatment(String status) {
        var item = item(true);
        item.fulfill(10L, status);
        assertEquals(status, item.fulfillmentStatus());
        assertFalse(item.fulfilled());
        assertFalse(item.ready());
    }

    @Test void completion_requires_its_document_and_reversal_removes_readiness() {
        var item = item(true);
        item.fulfill(null, "COMPLETED");
        assertFalse(item.ready());
        item.fulfill(10L, "COMPLETED");
        assertTrue(item.ready());
        item.reverseFulfillment(null);
        assertNull(item.fulfillmentId());
        assertNull(item.fulfillmentStatus());
        assertFalse(item.ready());
    }

    @Test void treatment_without_medication_does_not_require_dispensing() {
        assertTrue(item(false).ready());
    }
}
