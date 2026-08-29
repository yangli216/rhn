package com.rhn.portal.dashboard;

import com.rhn.workmanagement.notification.NotificationSummaryResponse;
import com.rhn.workmanagement.task.TaskSummaryResponse;

public record PortalSummaryResponse(
        TaskSummaryResponse tasks,
        NotificationSummaryResponse notifications,
        long registeredToday,
        long inProgress,
        long completedToday,
        long activeResidents
) {
}
