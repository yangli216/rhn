package com.rhn.platform.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "audit_logs")
class AuditLog {
    @Id
    private Long id;
    @Column(name = "tenant_id")
    private Long tenantId;
    @Column(nullable = false)
    private String actor;
    @Column(name = "http_method", nullable = false)
    private String httpMethod;
    @Column(name = "request_path", nullable = false)
    private String requestPath;
    @Column(name = "response_status", nullable = false)
    private int responseStatus;
    @Column(name = "correlation_id", nullable = false)
    private String correlationId;
    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    protected AuditLog() {
    }

    AuditLog(Long tenantId, String actor, String httpMethod, String requestPath,
             int responseStatus, String correlationId) {
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.actor = actor;
        this.httpMethod = httpMethod;
        this.requestPath = requestPath;
        this.responseStatus = responseStatus;
        this.correlationId = correlationId;
        this.occurredAt = Instant.now();
    }
}

