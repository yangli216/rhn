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
@Table(name = "idempotency_records")
class IdempotencyRecord {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "operation_code", nullable = false) private String operationCode;
    @Column(name = "idempotency_key", nullable = false) private String idempotencyKey;
    @Column(name = "request_hash", nullable = false) private String requestHash;
    @Column(name = "resource_type") private String resourceType;
    @Column(name = "resource_id") private Long resourceId;
    @Column(nullable = false) private String status;
    @Column(name = "response_status") private Integer responseStatus;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "response_json") private String responseJson;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "completed_at") private Instant completedAt;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;

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
