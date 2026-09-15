package com.rhn.workmanagement.announcement;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

interface AnnouncementReadReceiptRepository extends JpaRepository<AnnouncementReadReceipt, Long> {
    Optional<AnnouncementReadReceipt> findByTenantIdAndAnnouncementIdAndUserId(
            Long tenantId, Long announcementId, Long userId);
    List<AnnouncementReadReceipt> findByTenantIdAndUserIdAndAnnouncementIdIn(
            Long tenantId, Long userId, List<Long> announcementIds);
}
