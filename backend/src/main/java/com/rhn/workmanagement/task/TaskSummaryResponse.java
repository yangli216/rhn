package com.rhn.workmanagement.task;

public record TaskSummaryResponse(long ready, long inProgress, long overdue, long totalOpen) {
}
