package com.rhn.workmanagement.api;

/** Stable read-only summary contract used by the portal dashboard. */
public interface WorkSummaryDirectory {
    TaskSummary tasks();
    NotificationSummary notifications();

    record TaskSummary(long ready, long inProgress, long overdue, long totalOpen) {}
    record NotificationSummary(long unread, long total) {}
}
