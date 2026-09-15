package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.PharmacyQueueChanged;
import com.rhn.platform.realtime.api.RealtimeEvent;
import com.rhn.platform.realtime.api.RealtimePublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.Map;

@Service
public class PharmacyRealtimeBridge {
    private final RealtimePublisher connections;

    public PharmacyRealtimeBridge(RealtimePublisher connections) { this.connections = connections; }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void on(PharmacyQueueChanged change) {
        String id = "pharmacy:" + change.sourceEventId() + ":" + change.medicationRequestId()
                + ":" + change.changeType();
        connections.publish(change.tenantId(), new RealtimeEvent(id, "PHARMACY_QUEUE_CHANGED",
                change.occurredAt(), "INFO", change.organizationId(), change.departmentId(), null,
                "MedicationRequest", change.medicationRequestId(), "/pharmacy",
                Map.of("changeType", change.changeType())), "PHARMACY.ACCESS");
    }
}
