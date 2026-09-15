package com.rhn.workmanagement.announcement;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "RHN_SYS_ANN")
class SystemAnnouncement {
    @Id @Column(name = "ID_SYS_ANN") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "SD_SCOPE_TYPE", nullable = false) private String scopeType;
    @Column(name = "ID_ORG") private Long organizationId;
    @Column(name = "ID_DEPT") private Long departmentId;
    @Column(name = "SD_CAT", nullable = false) private String category;
    @Column(name = "SD_PRIORITY", nullable = false) private String priority;
    @Column(name = "NA_TITLE", nullable = false) private String title;
    @Column(name = "DES_SUM", nullable = false) private String summary;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR) @Column(name = "DES_CONTENT", nullable = false) private String content;
    @Column(name = "FG_PINNED", nullable = false) private boolean pinned;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_PUBLISH") private Instant publishAt;
    @Column(name = "DT_EXPIRE") private Instant expireAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "ID_USER_PUBLISD") private Long publishedBy;
    @Column(name = "DT_PUBLISD") private Instant publishedAt;
    @Column(name = "ID_USER_WITHDRAWN") private Long withdrawnBy;
    @Column(name = "DT_WITHDRAWN") private Instant withdrawnAt;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;

    protected SystemAnnouncement() {}

    SystemAnnouncement(Long tenantId, String scopeType, Long organizationId, Long departmentId,
                       String category, String priority, String title, String summary, String content,
                       boolean pinned, Long createdBy, Instant now) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.createdBy = createdBy;
        this.status = "DRAFT"; this.createdAt = now; this.updatedAt = now;
        revise(scopeType, organizationId, departmentId, category, priority, title, summary, content, pinned, now);
    }

    void revise(String scopeType, Long organizationId, Long departmentId, String category, String priority,
                String title, String summary, String content, boolean pinned, Instant now) {
        if (!"DRAFT".equals(status)) throw new IllegalStateException("只有草稿公告可以编辑");
        this.scopeType = scopeType; this.organizationId = organizationId; this.departmentId = departmentId;
        this.category = category; this.priority = priority; this.title = title;
        this.summary = summary; this.content = content; this.pinned = pinned; this.updatedAt = now;
    }

    boolean schedule(Instant effectiveAt, Instant expiresAt, Long actorId, Instant now) {
        if (!"DRAFT".equals(status)) throw new IllegalStateException("只有草稿公告可以发布");
        publishAt = effectiveAt == null ? now : effectiveAt; expireAt = expiresAt; publishedBy = actorId;
        status = publishAt.isAfter(now) ? "SCHEDULED" : "PUBLISHED";
        if ("PUBLISHED".equals(status)) publishedAt = now;
        updatedAt = now;
        return "PUBLISHED".equals(status);
    }

    boolean activate(Instant now) {
        if (!"SCHEDULED".equals(status) || publishAt == null || publishAt.isAfter(now)) return false;
        status = "PUBLISHED"; publishedAt = now; updatedAt = now; return true;
    }

    boolean expire(Instant now) {
        if (!"PUBLISHED".equals(status) || expireAt == null || expireAt.isAfter(now)) return false;
        status = "EXPIRED"; updatedAt = now; return true;
    }

    void withdraw(Long actorId, Instant now) {
        if (!("PUBLISHED".equals(status) || "SCHEDULED".equals(status))) {
            throw new IllegalStateException("只有已发布或待发布公告可以撤回");
        }
        status = "WITHDRAWN"; withdrawnBy = actorId; withdrawnAt = now; updatedAt = now;
    }

    boolean visibleAt(Instant now) {
        return "PUBLISHED".equals(status) && publishAt != null && !publishAt.isAfter(now)
                && (expireAt == null || expireAt.isAfter(now));
    }

    Long id() { return id; }
    long revision() { return revision; }
    Long tenantId() { return tenantId; }
    String scopeType() { return scopeType; }
    Long organizationId() { return organizationId; }
    Long departmentId() { return departmentId; }
    String category() { return category; }
    String priority() { return priority; }
    String title() { return title; }
    String summary() { return summary; }
    String content() { return content; }
    boolean pinned() { return pinned; }
    String status() { return status; }
    Instant publishAt() { return publishAt; }
    Instant expireAt() { return expireAt; }
    Long createdBy() { return createdBy; }
    Long publishedBy() { return publishedBy; }
    Instant publishedAt() { return publishedAt; }
    Long withdrawnBy() { return withdrawnBy; }
    Instant withdrawnAt() { return withdrawnAt; }
    Instant createdAt() { return createdAt; }
    Instant updatedAt() { return updatedAt; }
}
