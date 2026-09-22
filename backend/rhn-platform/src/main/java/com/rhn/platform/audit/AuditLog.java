package com.rhn.platform.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_AUD_LOG")
class AuditLog {
    @Id
    @Column(name = "ID_AUD_LOG") private Long id;
    @Column(name = "ID_TNT")
    private Long tenantId;
    @Column(name = "CD_ACTOR", nullable = false)
    private String actor;
    @Column(name = "SD_HTTP_METHOD", nullable = false)
    private String httpMethod;
    @Column(name = "REQUEST_PATH", nullable = false)
    private String requestPath;
    @Column(name = "SD_RESP_STATUS", nullable = false)
    private int responseStatus;
    @Column(name = "ID_CORR", nullable = false)
    private String correlationId;
    @Column(name = "DT_OCCRD", nullable = false)
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

