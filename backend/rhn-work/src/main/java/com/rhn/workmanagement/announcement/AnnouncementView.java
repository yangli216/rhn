package com.rhn.workmanagement.announcement;

import java.time.Instant;

public record AnnouncementView(
        Long id, long revision, String scopeType, Long organizationId, Long departmentId,
        String category, String priority, String title, String summary, String content,
        boolean pinned, String status, Instant publishAt, Instant expireAt,
        Long createdBy, Long publishedBy, Instant publishedAt, Long withdrawnBy, Instant withdrawnAt,
        Instant createdAt, Instant updatedAt, boolean read
) {}
