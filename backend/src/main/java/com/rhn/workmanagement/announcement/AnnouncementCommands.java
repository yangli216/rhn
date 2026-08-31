package com.rhn.workmanagement.announcement;

import java.time.Instant;

public final class AnnouncementCommands {
    private AnnouncementCommands() {}

    public record Draft(String scopeType, Long organizationId, Long departmentId, String category,
                        String priority, String title, String summary, String content, boolean pinned) {}
    public record Publish(long expectedRevision, Instant publishAt, Instant expireAt) {}
}
