package com.rhn.healthcore.mpi;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "resident_source_records")
class ResidentSourceRecord {
    @Id
    private Long id;
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;
    @Column(name = "source_organization_id", nullable = false)
    private Long sourceOrganizationId;
    @Column(name = "source_system", nullable = false)
    private String sourceSystem;
    @Column(name = "source_record_id", nullable = false)
    private String sourceRecordId;
    @Column(name = "resident_id")
    private Long residentId;
    @Enumerated(EnumType.STRING)
    @Column(name = "match_status", nullable = false)
    private ResidentMatchStatus matchStatus;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "raw_payload_json", nullable = false)
    private String rawPayloadJson;
    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;
    @Column(name = "linked_by")
    private String linkedBy;
    @Column(name = "linked_at")
    private Instant linkedAt;
    @Column(name = "link_reason")
    private String linkReason;
    @Version
    private long version;

    protected ResidentSourceRecord() {
    }

    ResidentSourceRecord(Long tenantId, Long sourceOrganizationId, String sourceSystem,
                         String sourceRecordId, String rawPayloadJson) {
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.sourceOrganizationId = sourceOrganizationId;
        this.sourceSystem = sourceSystem;
        this.sourceRecordId = sourceRecordId;
        this.rawPayloadJson = rawPayloadJson;
        this.matchStatus = ResidentMatchStatus.UNMATCHED;
        this.lastSeenAt = Instant.now();
    }

    void requireReview() { this.matchStatus = ResidentMatchStatus.REVIEW; }
    void link(Long residentId, String actor, String reason) {
        this.residentId = residentId;
        this.matchStatus = ResidentMatchStatus.MATCHED;
        this.linkedBy = actor;
        this.linkedAt = Instant.now();
        this.linkReason = reason;
    }
    void reassign(Long residentId, String actor, String reason) { link(residentId, actor, reason); }
    Long id() { return id; }
    Long tenantId() { return tenantId; }
    Long sourceOrganizationId() { return sourceOrganizationId; }
    String sourceSystem() { return sourceSystem; }
    String sourceRecordId() { return sourceRecordId; }
    Long residentId() { return residentId; }
    ResidentMatchStatus matchStatus() { return matchStatus; }
    String rawPayloadJson() { return rawPayloadJson; }
}
