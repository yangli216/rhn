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
@Table(name = "RHN_PI_PAT_SRC_RECORD")
class ResidentSourceRecord {
    @Id
    @Column(name = "ID_PAT_SRC_RECORD") private Long id;
    @Column(name = "ID_TNT", nullable = false)
    private Long tenantId;
    @Column(name = "ID_ORG_SRC", nullable = false)
    private Long sourceOrganizationId;
    @Column(name = "CD_SRC_SYS", nullable = false)
    private String sourceSystem;
    @Column(name = "ID_SRC_RECORD", nullable = false)
    private String sourceRecordId;
    @Column(name = "ID_PAT")
    private Long residentId;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_MATCH_STATUS", nullable = false)
    private ResidentMatchStatus matchStatus;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "JSON_RAW_PAYLOAD", nullable = false)
    private String rawPayloadJson;
    @Column(name = "DT_LAST_SEEN", nullable = false)
    private Instant lastSeenAt;
    @Column(name = "ID_USER_LINKED")
    private String linkedBy;
    @Column(name = "DT_LINKED")
    private Instant linkedAt;
    @Column(name = "DES_LINK_REASON")
    private String linkReason;
    @Version
    @Column(name = "REVISION") private long version;

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
