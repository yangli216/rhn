package com.rhn.healthcore.mpi;

import java.util.List;

public record ResidentPageView(
        List<ResidentResponse> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean first,
        boolean last
) {
}
