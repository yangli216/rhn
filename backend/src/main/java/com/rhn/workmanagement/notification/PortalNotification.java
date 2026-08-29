package com.rhn.workmanagement.notification;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "portal_notifications")
class PortalNotification {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id") private Long organizationId;
    @Column(name = "department_id") private Long departmentId;
    @Column(name = "recipient_user_id") private Long recipientUserId;
    @Column(nullable = false) private String category;
    @Column(nullable = false) private String severity;
    @Column(nullable = false) private String title;
    @Column(nullable = false) private String message;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private NotificationStatus status;
    @Column(name = "route_path") private String routePath;
    @Column(name = "source_type", nullable = false) private String sourceType;
    @Column(name = "source_id", nullable = false) private Long sourceId;
    @Column(name = "dedup_key", nullable = false) private String dedupKey;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "read_at") private Instant readAt;
    @Column(name = "archived_at") private Instant archivedAt;
    @Version @Column(nullable = false) private long revision;

    protected PortalNotification() {
    }

    PortalNotification(Long tenantId, Long organizationId, Long departmentId, Long recipientUserId,
                       String category, String severity, String title, String message, String routePath,
                       String sourceType, Long sourceId, String dedupKey) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.organizationId = organizationId;
        this.departmentId = departmentId;
        this.recipientUserId = recipientUserId;
        this.category = category;
        this.severity = severity;
        this.title = title;
        this.message = message;
        this.status = NotificationStatus.UNREAD;
        this.routePath = routePath;
        this.sourceType = sourceType;
        this.sourceId = sourceId;
        this.dedupKey = dedupKey;
        this.createdAt = Instant.now();
    }

    void read() {
        if (status == NotificationStatus.UNREAD) {
            status = NotificationStatus.READ;
            readAt = Instant.now();
        }
    }

    void archive() {
        status = NotificationStatus.ARCHIVED;
        archivedAt = Instant.now();
        if (readAt == null) readAt = archivedAt;
    }

    Long id() { return id; }
    Long tenantId() { return tenantId; }
    Long organizationId() { return organizationId; }
    Long departmentId() { return departmentId; }
    Long recipientUserId() { return recipientUserId; }
    String category() { return category; }
    String severity() { return severity; }
    String title() { return title; }
    String message() { return message; }
    NotificationStatus status() { return status; }
    String routePath() { return routePath; }
    String sourceType() { return sourceType; }
    Long sourceId() { return sourceId; }
    Instant createdAt() { return createdAt; }
    Instant readAt() { return readAt; }
    long revision() { return revision; }
}
