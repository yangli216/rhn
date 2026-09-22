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
@Table(name = "RHN_AN_RUN")
public class AnalysisRun {
    @Id
    @Column(name = "ID_RUN", nullable = false) private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_DRAFT_VER", nullable = false) private Long draftVersionId;
    @Column(name = "ID_USER_OWNER", nullable = false) private Long ownerId;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "SD_STATE", nullable = false, length = 24) private String state = "QUEUED";
    @Column(name = "SD_DELIV", nullable = false, length = 24) private String deliveryState = "UNAVAILABLE";

    protected AnalysisRun() {}

    public AnalysisRun(Long tenantId, Long draftVersionId, Long ownerId, Instant createdAt) {
        this.id = GlobalIds.next();
        this.tenantId = Strings.requireId(tenantId, "tenantId");
        this.draftVersionId = Strings.requireId(draftVersionId, "draftVersionId");
        this.ownerId = Strings.requireId(ownerId, "ownerId");
        this.createdAt = Strings.require(createdAt, "createdAt");
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long draftVersionId() { return draftVersionId; }
    public Long ownerId() { return ownerId; }
    public Instant createdAt() { return createdAt; }
    public long revision() { return revision; }
    public String state() { return state; }
    public String deliveryState() { return deliveryState; }
}
