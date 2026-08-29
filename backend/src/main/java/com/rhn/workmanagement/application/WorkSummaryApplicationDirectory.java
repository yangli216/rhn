package com.rhn.workmanagement.application;

import com.rhn.workmanagement.api.WorkSummaryDirectory;
import com.rhn.workmanagement.notification.NotificationService;
import com.rhn.workmanagement.notification.NotificationSummaryResponse;
import com.rhn.workmanagement.task.TaskService;
import com.rhn.workmanagement.task.TaskSummaryResponse;
import org.springframework.stereotype.Service;

@Service
public class WorkSummaryApplicationDirectory implements WorkSummaryDirectory {
    private final TaskService taskService;
    private final NotificationService notificationService;

    public WorkSummaryApplicationDirectory(TaskService taskService, NotificationService notificationService) {
        this.taskService = taskService;
        this.notificationService = notificationService;
    }

    @Override
    public TaskSummary tasks() {
        TaskSummaryResponse value = taskService.summary();
        return new TaskSummary(value.ready(), value.inProgress(), value.overdue(), value.totalOpen());
    }

    @Override
    public NotificationSummary notifications() {
        NotificationSummaryResponse value = notificationService.summary();
        return new NotificationSummary(value.unread(), value.total());
    }
}
