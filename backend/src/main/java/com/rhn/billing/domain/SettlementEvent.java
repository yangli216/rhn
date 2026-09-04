package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_BIL_STL_EVT")
public class SettlementEvent {
    @Id @Column(name = "ID_STL_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_STL", nullable = false) private Long settlementId;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "SD_STATUS_FROM") private String statusFrom;
    @Column(name = "SD_STATUS_TO", nullable = false) private String statusTo;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "ID_ACTOR") private Long actorId;
    @Column(name = "CD_ERROR") private String errorCode;
    @Column(name = "DES_ERROR_MSG") private String errorMessage;
    @Column(name = "DT_OCCURRED", nullable = false) private Instant occurredAt;

    protected SettlementEvent() {}
    public SettlementEvent(Long tenantId, Long settlementId, String eventType, String statusFrom,
                           String statusTo, String commandCode, Long actorId, Instant occurredAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.settlementId = settlementId;
        this.eventType = eventType; this.statusFrom = statusFrom; this.statusTo = statusTo;
        this.commandCode = commandCode; this.actorId = actorId; this.occurredAt = occurredAt;
    }
    public Long id() { return id; } public String eventType() { return eventType; }
    public String statusFrom() { return statusFrom; } public String statusTo() { return statusTo; }
    public String commandCode() { return commandCode; } public Long actorId() { return actorId; }
    public String errorCode() { return errorCode; } public String errorMessage() { return errorMessage; }
    public Instant occurredAt() { return occurredAt; }
}
