package com.rhn.outpatient.encounter;

import java.util.List;

public record EncounterPageView(
        List<EncounterQueryItem> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean first,
        boolean last
) {
}
