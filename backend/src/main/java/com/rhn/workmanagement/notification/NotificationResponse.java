package com.rhn.workmanagement.notification;

import java.time.Instant;

public record NotificationResponse(
        Long id,
        String category,
        String severity,
        String title,
        String message,
        String status,
        String routePath,
        String sourceType,
        Long sourceId,
        Instant createdAt,
        Instant readAt,
        long revision
) {
    static NotificationResponse from(PortalNotification notification) {
        return new NotificationResponse(notification.id(), notification.category(), notification.severity(),
                notification.title(), notification.message(), notification.status().name(), notification.routePath(),
                notification.sourceType(), notification.sourceId(), notification.createdAt(), notification.readAt(),
                notification.revision());
    }
}
