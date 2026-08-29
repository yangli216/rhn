package com.rhn.workmanagement.notification;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

interface PortalNotificationRepository extends JpaRepository<PortalNotification, Long> {
    boolean existsByTenantIdAndDedupKey(Long tenantId, String dedupKey);
    Optional<PortalNotification> findByIdAndTenantId(Long id, Long tenantId);

    @Query("""
            select notification from PortalNotification notification
             where notification.tenantId = :tenantId and notification.status <> com.rhn.workmanagement.notification.NotificationStatus.ARCHIVED
               and (notification.recipientUserId = :userId
                 or (notification.recipientUserId is null and notification.organizationId = :organizationId
                     and (notification.departmentId is null or notification.departmentId = :departmentId)))
             order by notification.createdAt desc
            """)
    List<PortalNotification> findInbox(@Param("tenantId") Long tenantId, @Param("userId") Long userId,
                                       @Param("organizationId") Long organizationId,
                                       @Param("departmentId") Long departmentId);
}
