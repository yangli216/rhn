package com.rhn.platform.idempotency;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Duration;
import java.time.Instant;

@Entity
@Table(name = "RHN_INT_IDEMP_RECORD")
class IdempotencyRecord {
    @Id @Column(name = "ID_IDEMP_RECORD") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "CD_OPERATION", nullable = false) private String operationCode;
    @Column(name = "CD_IDEMP_KEY", nullable = false) private String idempotencyKey;
    @Column(name = "HASH_REQ", nullable = false) private String requestHash;
    @Column(name = "SD_RSRC_TYPE") private String resourceType;
    @Column(name = "ID_RSRC") private Long resourceId;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "SD_RESP_STATUS") private Integer responseStatus;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "JSON_RESP") private String responseJson;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "DT_COMPLETED") private Instant completedAt;
    @Column(name = "DT_EXPIRES", nullable = false) private Instant expiresAt;

    protected IdempotencyRecord() {
    }

    IdempotencyRecord(Long tenantId, String operationCode, String idempotencyKey, String requestHash, Duration ttl) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.operationCode = operationCode;
        this.idempotencyKey = idempotencyKey;
        this.requestHash = requestHash;
        this.status = "IN_PROGRESS";
        this.createdAt = Instant.now();
        this.expiresAt = createdAt.plus(ttl);
    }

    void complete(String resourceType, Long resourceId, int responseStatus, String responseJson) {
        this.resourceType = resourceType;
        this.resourceId = resourceId;
        this.responseStatus = responseStatus;
        this.responseJson = responseJson;
        this.status = "COMPLETED";
        this.completedAt = Instant.now();
    }

    String requestHash() { return requestHash; }
    String status() { return status; }
    String resourceType() { return resourceType; }
    Long resourceId() { return resourceId; }
    Integer responseStatus() { return responseStatus; }
    String responseJson() { return responseJson; }
    Instant expiresAt() { return expiresAt; }
}
