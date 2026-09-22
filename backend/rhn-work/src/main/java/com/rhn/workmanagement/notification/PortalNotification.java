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
@Table(name = "RHN_SYS_PORTAL_NOTIFY")
class PortalNotification {
    @Id @Column(name = "ID_PORTAL_NOTIFY") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG") private Long organizationId;
    @Column(name = "ID_DEPT") private Long departmentId;
    @Column(name = "ID_USER_RCPNT") private Long recipientUserId;
    @Column(name = "SD_CAT", nullable = false) private String category;
    @Column(name = "SD_SEV", nullable = false) private String severity;
    @Column(name = "NA_TITLE", nullable = false) private String title;
    @Column(name = "DES_MSG", nullable = false) private String message;
    @Enumerated(EnumType.STRING) @Column(name = "SD_STATUS", nullable = false) private NotificationStatus status;
    @Column(name = "ROUTE_PATH") private String routePath;
    @Column(name = "SD_SRC_TYPE", nullable = false) private String sourceType;
    @Column(name = "ID_SRC", nullable = false) private Long sourceId;
    @Column(name = "CD_DEDUP_KEY", nullable = false) private String dedupKey;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "DT_READ") private Instant readAt;
    @Column(name = "DT_ARCHD") private Instant archivedAt;
    @Version @Column(name = "REVISION", nullable = false) private long revision;

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
