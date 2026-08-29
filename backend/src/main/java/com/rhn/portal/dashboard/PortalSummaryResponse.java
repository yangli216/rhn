package com.rhn.portal.dashboard;

import com.rhn.workmanagement.api.WorkSummaryDirectory.NotificationSummary;
import com.rhn.workmanagement.api.WorkSummaryDirectory.TaskSummary;

public record PortalSummaryResponse(
        TaskSummary tasks,
        NotificationSummary notifications,
        long registeredToday,
        long inProgress,
        long completedToday,
        long activeResidents
) {
}
