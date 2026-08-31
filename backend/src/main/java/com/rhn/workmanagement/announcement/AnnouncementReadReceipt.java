package com.rhn.workmanagement.announcement;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "announcement_read_receipts")
class AnnouncementReadReceipt {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "announcement_id", nullable = false) private Long announcementId;
    @Column(name = "user_id", nullable = false) private Long userId;
    @Column(name = "read_at", nullable = false) private Instant readAt;

    protected AnnouncementReadReceipt() {}

    AnnouncementReadReceipt(Long tenantId, Long announcementId, Long userId, Instant readAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.announcementId = announcementId;
        this.userId = userId; this.readAt = readAt;
    }

    Long announcementId() { return announcementId; }
}
