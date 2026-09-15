package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_BIL_CASHIER_CLOSE_EVT")
public class CashierCloseEvent {
    @Id @Column(name = "ID_CASHIER_CLOSE_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CASHIER_CLOSE", nullable = false) private Long cashierCloseId;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "SD_STATUS_FROM") private String statusFrom;
    @Column(name = "SD_STATUS_TO", nullable = false) private String statusTo;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "ID_ACTOR", nullable = false) private Long actorId;
    @Column(name = "DES_REASON") private String reason;
    @Column(name = "DT_OCCURRED", nullable = false) private Instant occurredAt;

    protected CashierCloseEvent() {}
    public CashierCloseEvent(Long tenantId, Long cashierCloseId, String eventType, String statusFrom,
                             String statusTo, String commandCode, Long actorId, String reason) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.cashierCloseId = cashierCloseId;
        this.eventType = eventType; this.statusFrom = statusFrom; this.statusTo = statusTo;
        this.commandCode = commandCode; this.actorId = actorId; this.reason = reason;
        this.occurredAt = Instant.now();
    }
}
