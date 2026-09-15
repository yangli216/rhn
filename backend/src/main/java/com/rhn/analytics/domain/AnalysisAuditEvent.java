package com.rhn.analytics.domain;

import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.text.Strings;
import jakarta.persistence.*;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;

/** A06 storage only; no approval, authorization or execution is implied by persistence. */
@Entity
@Immutable
@Table(name = "RHN_AN_AUDIT_EVT")
public class AnalysisAuditEvent {
    @Id
    @Column(name = "ID_AUDIT_EVT", nullable = false) private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_RUN", nullable = false) private Long runId;
    @Column(name = "ID_USER_ACTOR", nullable = false) private Long actorId;
    @Column(name = "CD_EVENT", nullable = false, length = 80) private String eventCode;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;

    protected AnalysisAuditEvent() {}

    public AnalysisAuditEvent(Long tenantId, Long runId, Long actorId, String eventCode, Instant createdAt) {
        this.id = GlobalIds.next();
        this.tenantId = Strings.requireId(tenantId, "tenantId");
        this.runId = Strings.requireId(runId, "runId");
        this.actorId = Strings.requireId(actorId, "actorId");
        this.eventCode = Strings.requireText(eventCode, "eventCode", 80);
        this.createdAt = Strings.require(createdAt, "createdAt");
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long runId() { return runId; }
    public Long actorId() { return actorId; }
    public String eventCode() { return eventCode; }
    public Instant createdAt() { return createdAt; }
}
