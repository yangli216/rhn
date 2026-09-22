package com.rhn.platform.eventing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_INT_EVT_CONSUME")
public class EventConsumption {
    @Id @Column(name = "ID_EVT_CONSUME") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "NA_CNSMR", nullable = false) private String consumerName;
    @Column(name = "ID_EVT", nullable = false) private Long eventId;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_PROCSD", nullable = false) private Instant processedAt;
    @Column(name = "DES_LAST_ERROR") private String lastError;

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
