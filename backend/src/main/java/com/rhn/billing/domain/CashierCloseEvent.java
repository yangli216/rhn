package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "cashier_close_events")
public class CashierCloseEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "cashier_close_id", nullable = false) private Long cashierCloseId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "status_from") private String statusFrom;
    @Column(name = "status_to", nullable = false) private String statusTo;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "actor_id", nullable = false) private Long actorId;
    @Column private String reason;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;

    protected CashierCloseEvent() {}
    public CashierCloseEvent(Long tenantId, Long cashierCloseId, String eventType, String statusFrom,
                             String statusTo, String commandCode, Long actorId, String reason) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.cashierCloseId = cashierCloseId;
        this.eventType = eventType; this.statusFrom = statusFrom; this.statusTo = statusTo;
        this.commandCode = commandCode; this.actorId = actorId; this.reason = reason;
        this.occurredAt = Instant.now();
    }
}
