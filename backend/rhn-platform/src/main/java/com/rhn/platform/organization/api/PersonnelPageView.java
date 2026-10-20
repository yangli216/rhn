package com.rhn.platform.organization.api;

import java.util.List;

public record PersonnelPageView(
        List<PersonnelRowView> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean first,
        boolean last
) {
}
