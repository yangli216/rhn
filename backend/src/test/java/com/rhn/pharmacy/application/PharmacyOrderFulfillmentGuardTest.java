package com.rhn.pharmacy.application;

import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.outpatient.api.OrderFulfillmentGuard.OrderRef;
import com.rhn.pharmacy.api.RefundPharmacyDirectory.RefundFulfillmentStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PharmacyOrderFulfillmentGuardTest {
    private final RefundPharmacyDirectoryService pharmacy = mock(RefundPharmacyDirectoryService.class);
    private final MedicationRequestDirectory requests = mock(MedicationRequestDirectory.class);
    @SuppressWarnings("unchecked")
    private final ObjectProvider<MedicationRequestDirectory> provider = mock(ObjectProvider.class);
    private final PharmacyOrderFulfillmentGuard guard;
    {
        when(provider.getObject()).thenReturn(requests);
        guard = new PharmacyOrderFulfillmentGuard(pharmacy, provider);
    }
    private final OrderRef medication = OrderRef.medication(1L, 10L);

    @Test
    void dispensed_or_partly_returned_medication_cannot_be_cancelled() {
        when(pharmacy.statusForRequest(1L, 10L)).thenReturn(new RefundFulfillmentStatus("DISPENSED", "COMPLETED"));
        assertEquals("药品已发药，不能直接撤销；请先由药房办理退药", guard.cancelBlockedReason(medication, true));
        when(pharmacy.statusForRequest(1L, 10L)).thenReturn(new RefundFulfillmentStatus("DISPENSED", "PARTIALLY_DISPENSED"));
        assertEquals("药品已发药，不能直接撤销；请先由药房办理退药", guard.cancelBlockedReason(medication, false));
        when(pharmacy.statusForRequest(1L, 10L)).thenReturn(new RefundFulfillmentStatus("RETURNED", "PARTIALLY_RETURNED"));
        assertEquals("药品已发药，不能直接撤销；请先由药房办理退药", guard.cancelBlockedReason(medication, false));
    }

    @Test
    void undispensed_or_fully_returned_medication_can_be_cancelled_and_releases_pending_work() {
        when(pharmacy.statusForRequest(1L, 10L)).thenReturn(RefundFulfillmentStatus.undispensed("READY_TO_PICK"));
        assertNull(guard.cancelBlockedReason(medication, true));
        when(pharmacy.statusForRequest(1L, 10L)).thenReturn(new RefundFulfillmentStatus("RETURNED", "RETURNED"));
        assertNull(guard.cancelBlockedReason(medication, true));

        guard.releaseUnstarted(medication);
        verify(pharmacy).cancelUnfulfilledForOrderCancellation(1L, 10L);
    }

    @Test
    void service_requests_are_not_the_pharmacys_concern() {
        OrderRef service = OrderRef.service(1L, 20L, "LABORATORY");
        assertNull(guard.cancelBlockedReason(service, true));
        guard.releaseUnstarted(service);
        verify(pharmacy, never()).statusForRequest(1L, 20L);
        verify(pharmacy, never()).cancelUnfulfilledForOrderCancellation(1L, 20L);
    }

    @Test
    void locking_checks_take_the_pharmacy_intake_lock_before_reading_fulfillment() {
        when(pharmacy.statusForRequest(1L, 10L)).thenReturn(RefundFulfillmentStatus.undispensed("READY_TO_PICK"));
        guard.cancelBlockedReason(medication, false);
        guard.withdrawBlockedReason(medication, false);
        verify(requests, never()).lockForPharmacyIntake(10L);

        guard.cancelBlockedReason(medication, true);
        guard.withdrawBlockedReason(medication, true);
        verify(requests, org.mockito.Mockito.times(2)).lockForPharmacyIntake(10L);
    }
}
