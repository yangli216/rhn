package com.rhn.platform.realtime.application;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "presence_metric_samples")
class PresenceMetricSample {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "scope_type", nullable = false) private String scopeType;
    @Column(name = "scope_key", nullable = false) private String scopeKey;
    @Column(name = "organization_id") private Long organizationId;
    @Column(name = "department_id") private Long departmentId;
    @Column(name = "bucket_at", nullable = false) private Instant bucketAt;
    @Column(name = "online_users", nullable = false) private long onlineUsers;
    @Column(name = "active_users", nullable = false) private long activeUsers;
    @Column(name = "online_contexts", nullable = false) private long onlineContexts;
    @Column(nullable = false) private long connections;
    @Column(nullable = false) private long instances;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

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
