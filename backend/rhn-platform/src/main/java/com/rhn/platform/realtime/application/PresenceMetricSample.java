package com.rhn.platform.realtime.application;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_ANL_PRES_METRIC_SAMPLE")
class PresenceMetricSample {
    @Id @Column(name = "ID_PRES_METRIC_SAMPLE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "SD_SCOPE_TYPE", nullable = false) private String scopeType;
    @Column(name = "CD_SCOPE_KEY", nullable = false) private String scopeKey;
    @Column(name = "ID_ORG") private Long organizationId;
    @Column(name = "ID_DEPT") private Long departmentId;
    @Column(name = "DT_BUCKET", nullable = false) private Instant bucketAt;
    @Column(name = "QTY_ONLINE_USER", nullable = false) private long onlineUsers;
    @Column(name = "QTY_ACTIVE_USER", nullable = false) private long activeUsers;
    @Column(name = "QTY_ONLINE_CTXS", nullable = false) private long onlineContexts;
    @Column(name = "QTY_CONNS", nullable = false) private long connections;
    @Column(name = "QTY_INSTS", nullable = false) private long instances;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;

    protected PresenceMetricSample() {}

    PresenceMetricSample(Long tenantId, String scopeType, String scopeKey, Long organizationId,
                         Long departmentId, Instant bucketAt, PresenceMetricValues values, Instant now) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.scopeType = scopeType; this.scopeKey = scopeKey;
        this.organizationId = organizationId; this.departmentId = departmentId; this.bucketAt = bucketAt;
        this.onlineUsers = values.onlineUsers(); this.activeUsers = values.activeUsers();
        this.onlineContexts = values.onlineContexts(); this.connections = values.connections();
        this.instances = values.instances(); this.createdAt = now;
    }

    Instant bucketAt() { return bucketAt; }
    long onlineUsers() { return onlineUsers; }
    long activeUsers() { return activeUsers; }
    long onlineContexts() { return onlineContexts; }
    long connections() { return connections; }
    long instances() { return instances; }
}
