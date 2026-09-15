package com.rhn.workmanagement.announcement;

import java.time.Instant;

public record AnnouncementChanged(Long announcementId, Long tenantId, Long organizationId, Long departmentId,
                                  String changeType, String priority, Instant occurredAt) {}
