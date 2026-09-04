package com.rhn.workmanagement.announcement;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_SYS_ANN_READ_RCPT")
class AnnouncementReadReceipt {
    @Id @Column(name = "ID_ANN_READ_RCPT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_SYS_ANN", nullable = false) private Long announcementId;
    @Column(name = "ID_USER", nullable = false) private Long userId;
    @Column(name = "DT_READ", nullable = false) private Instant readAt;

    protected AnnouncementReadReceipt() {}

    AnnouncementReadReceipt(Long tenantId, Long announcementId, Long userId, Instant readAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.announcementId = announcementId;
        this.userId = userId; this.readAt = readAt;
    }

    Long announcementId() { return announcementId; }
}
