package com.rhn.outpatient.encounter;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "outpatient_referral_events")
class OutpatientReferralEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "referral_request_id", nullable = false) private Long referralRequestId;
    @Column(name = "status_from") private String statusFrom;
    @Column(name = "status_to", nullable = false) private String statusTo;
    @Column(name = "action_code", nullable = false) private String actionCode;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "actor_id", nullable = false) private Long actorId;
    private String reason;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;

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
