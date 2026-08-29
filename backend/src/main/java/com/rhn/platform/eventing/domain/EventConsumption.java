package com.rhn.platform.eventing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "event_consumptions")
public class EventConsumption {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "consumer_name", nullable = false) private String consumerName;
    @Column(name = "event_id", nullable = false) private Long eventId;
    @Column(nullable = false) private String status;
    @Column(name = "processed_at", nullable = false) private Instant processedAt;
    @Column(name = "last_error") private String lastError;

    protected EventConsumption() {
    }

    public EventConsumption(Long tenantId, String consumerName, Long eventId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.consumerName = consumerName;
        this.eventId = eventId;
        this.status = "COMPLETED";
        this.processedAt = Instant.now();
    }
}
