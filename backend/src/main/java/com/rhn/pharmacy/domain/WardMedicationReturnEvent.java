package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_WARD_MED_RETURN_EVT")
public class WardMedicationReturnEvent {
    @Id @Column(name = "ID_WARD_MED_RETURN_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_WARD_MED_RETURN_REQ", nullable = false) private Long returnRequestId;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "SD_FROM_STATUS") private String fromStatus;
    @Column(name = "SD_TO_STATUS", nullable = false) private String toStatus;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "HASH_PAYLOAD", nullable = false) private String payloadHash;
    @Column(name = "DT_OCCURRED", nullable = false) private Instant occurredAt;
    @Column(name = "ID_USER_OCCURRED", nullable = false) private Long occurredBy;
    @Column(name = "DES_NOTE") private String note;

    protected WardMedicationReturnEvent() {
    }

    public WardMedicationReturnEvent(WardMedicationReturnRequest request, String eventType,
                                     String fromStatus, String commandCode, String payloadHash,
                                     Long actorId, String note) {
        this.id = GlobalIds.next();
        this.tenantId = request.tenantId();
        this.returnRequestId = request.id();
        this.eventType = eventType;
        this.fromStatus = fromStatus;
        this.toStatus = request.status();
        this.commandCode = commandCode;
        this.payloadHash = payloadHash;
        this.occurredAt = Instant.now();
        this.occurredBy = actorId;
        this.note = note;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long returnRequestId() { return returnRequestId; }
    public String eventType() { return eventType; }
    public String fromStatus() { return fromStatus; }
    public String toStatus() { return toStatus; }
    public String commandCode() { return commandCode; }
    public String payloadHash() { return payloadHash; }
    public Instant occurredAt() { return occurredAt; }
    public Long occurredBy() { return occurredBy; }
    public String note() { return note; }
}
