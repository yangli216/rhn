package com.rhn.outpatient.encounter;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_EX_OP_REFER_EVT")
class OutpatientReferralEvent {
    @Id @Column(name = "ID_OP_REFER_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_OP_REFER_REQ", nullable = false) private Long referralRequestId;
    @Column(name = "SD_STATUS_FROM") private String statusFrom;
    @Column(name = "SD_STATUS_TO", nullable = false) private String statusTo;
    @Column(name = "CD_ACTION", nullable = false) private String actionCode;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "ID_ACTOR", nullable = false) private Long actorId;
    @Column(name = "DES_REASON") private String reason;
    @Column(name = "DT_OCCURRED", nullable = false) private Instant occurredAt;

    protected OutpatientReferralEvent() {}

    OutpatientReferralEvent(OutpatientReferralRequest request, String from, String action,
                            String commandCode, Long actorId, String reason) {
        this.id = GlobalIds.next();
        this.tenantId = request.tenantId();
        this.referralRequestId = request.id();
        this.statusFrom = from;
        this.statusTo = request.status().name();
        this.actionCode = action;
        this.commandCode = commandCode;
        this.actorId = actorId;
        this.reason = reason;
        this.occurredAt = Instant.now();
    }
}
