package com.rhn.platform.organization.api;

import java.util.List;

public record StaffDetailView(
        StaffView practitioner,
        List<EmploymentView> employments,
        List<StaffAssignmentView> assignments
) {
    public StaffDetailView {
        employments = List.copyOf(employments);
        assignments = List.copyOf(assignments);
    }
}
