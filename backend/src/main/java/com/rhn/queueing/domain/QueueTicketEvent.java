package com.rhn.queueing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_SC_QUEUE_TICKET_EVT")
public class QueueTicketEvent {
    @Id @Column(name = "ID_QUEUE_TICKET_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_QUEUE_TICKET", nullable = false) private Long queueTicketId;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "SD_STATUS_FROM") private String statusFrom;
    @Column(name = "SD_STATUS_TO", nullable = false) private String statusTo;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "DT_OCCURRED", nullable = false) private Instant occurredAt;
    @Column(name = "ID_USER_OCCURRED", nullable = false) private Long occurredBy;
    @Column(name = "ID_SVC_LOC") private Long serviceLocationId;
    @Column(name = "DES_QUEUE_TICKET_EVT") private String description;

    protected QueueTicketEvent() {}

    public QueueTicketEvent(Long tenantId, Long queueTicketId, String eventType, String statusFrom,
                            String statusTo, String commandCode, Instant occurredAt, Long occurredBy,
                            Long serviceLocationId, String description) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.queueTicketId = queueTicketId;
        this.eventType = eventType;
        this.statusFrom = statusFrom;
        this.statusTo = statusTo;
        this.commandCode = commandCode;
        this.occurredAt = occurredAt;
        this.occurredBy = occurredBy;
        this.serviceLocationId = serviceLocationId;
        this.description = description;
    }

    public Long queueTicketId() { return queueTicketId; }
}
