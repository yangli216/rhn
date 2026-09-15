package com.rhn.workmanagement.announcement;

import com.rhn.platform.realtime.api.RealtimeEvent;
import com.rhn.platform.realtime.api.RealtimePublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.Map;

@Service
public class AnnouncementRealtimeBridge {
    private final RealtimePublisher connections;

    public AnnouncementRealtimeBridge(RealtimePublisher connections) { this.connections = connections; }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void on(AnnouncementChanged change) {
        String severity = "URGENT".equals(change.priority()) ? "CRITICAL"
                : "IMPORTANT".equals(change.priority()) ? "WARNING" : "INFO";
        connections.publish(change.tenantId(), new RealtimeEvent(
                "announcement:" + change.announcementId() + ":" + change.changeType(), change.changeType(),
                change.occurredAt(), severity, change.organizationId(), change.departmentId(), null,
                "SystemAnnouncement", change.announcementId(), null,
                Map.of("priority", change.priority())), "ANNOUNCEMENT.READ");
    }
}
