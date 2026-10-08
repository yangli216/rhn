package com.rhn.pharmacy.application;

import com.rhn.pharmacy.domain.DispenseTaskLine;
import com.rhn.pharmacy.domain.DispenseTaskLineStatus;
import com.rhn.pharmacy.domain.MedicationDispenseLine;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseLineRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import java.math.BigDecimal;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MedicationFulfillmentTruthTest {
    @Mock DispenseTaskLineRepository lines;
    @Mock MedicationDispenseLineRepository dispenseLines;
    @Mock MedicationDispenseRepository dispenses;
    @InjectMocks JpaMedicationFulfillmentDirectory directory;

    private DispenseTaskLine line(long id, DispenseTaskLineStatus status, String net) {
        var line = mock(DispenseTaskLine.class);
        when(line.id()).thenReturn(id);
        when(line.status()).thenReturn(status);
        when(line.netDispensedQuantity()).thenReturn(new BigDecimal(net));
        return line;
    }
    private void requestLines(DispenseTaskLine... values) {
        when(lines.findByTenantIdAndRequestIdOrderById(1L, 2L)).thenReturn(List.of(values));
    }
    private void issued(long lineId, long dispenseId, String quantity) {
        var issue = mock(MedicationDispenseLine.class);
        when(issue.quantityDispensed()).thenReturn(new BigDecimal(quantity));
        if (new BigDecimal(quantity).signum() > 0) when(issue.medicationDispenseId()).thenReturn(dispenseId);
        when(dispenseLines.findIssuedLines(1L, lineId)).thenReturn(List.of(issue));
    }

    @Test void a_completed_line_does_not_hide_an_unfinished_line_regardless_of_order() {
        var complete = line(10L, DispenseTaskLineStatus.COMPLETED, "1");
        var pending = line(11L, DispenseTaskLineStatus.PENDING, "0");
        issued(10L, 100L, "1");
        for (var order : List.of(List.of(complete, pending), List.of(pending, complete))) {
            when(lines.findByTenantIdAndRequestIdOrderById(1L, 2L)).thenReturn(order);
            var fact = directory.fulfillmentForRequest(1L, 2L);
            assertFalse(fact.completed());
            assertEquals("PARTIAL", fact.status());
            assertEquals(100L, fact.dispenseId());
        }
    }

    @Test void all_lines_need_their_own_issued_records() {
        requestLines(line(10L, DispenseTaskLineStatus.COMPLETED, "1"),
                line(11L, DispenseTaskLineStatus.COMPLETED, "2"));
        issued(10L, 100L, "1");
        assertFalse(directory.fulfillmentForRequest(1L, 2L).completed());
        issued(11L, 101L, "2");
        var fact = directory.fulfillmentForRequest(1L, 2L);
        assertTrue(fact.completed());
        assertEquals("COMPLETED", fact.status());
        assertEquals(101L, fact.dispenseId());
        assertEquals(new BigDecimal("3"), fact.netDispensedQuantity());
        verifyNoInteractions(dispenses); // A task header cannot prove this particular line was issued.
    }

    @Test void a_completed_flag_with_no_issued_record_is_not_evidence() {
        requestLines(line(10L, DispenseTaskLineStatus.COMPLETED, "1"));
        var fact = directory.fulfillmentForRequest(1L, 2L);
        assertFalse(fact.completed());
        assertNull(fact.dispenseId());
    }

    @Test void a_zero_quantity_document_cannot_prove_dispensing() {
        requestLines(line(10L, DispenseTaskLineStatus.COMPLETED, "1"));
        issued(10L, 100L, "0");
        assertFalse(directory.fulfillmentForRequest(1L, 2L).completed());
        assertNull(directory.fulfillmentForRequest(1L, 2L).dispenseId());
    }

    @ParameterizedTest @EnumSource(value = DispenseTaskLineStatus.class, names = {"PARTIAL", "RETURNED", "CANCELLED"})
    void issued_documents_do_not_override_the_current_line_status(DispenseTaskLineStatus status) {
        requestLines(line(10L, status, "1"));
        issued(10L, 100L, "2");
        var fact = directory.fulfillmentForRequest(1L, 2L);
        assertFalse(fact.completed());
        assertEquals(status.name(), fact.status());
    }

    @Test void no_intake_is_explicitly_unfulfilled() {
        var fact = directory.fulfillmentForRequest(1L, 2L);
        assertFalse(fact.completed());
        assertEquals("NOT_INTAKE", fact.status());
        assertNull(fact.dispenseId());
    }

    @Test void mixed_unfulfilled_states_do_not_invent_a_pending_review() {
        requestLines(line(10L, DispenseTaskLineStatus.RETURNED, "0"),
                line(11L, DispenseTaskLineStatus.CANCELLED, "0"));
        var fact = directory.fulfillmentForRequest(1L, 2L);
        assertFalse(fact.completed());
        assertEquals("INCOMPLETE", fact.status());
    }
}
