package com.rhn.outpatient.scheduling;

import com.rhn.outpatient.api.OutpatientRegistrationDirectory.ReceptionQueueItem;

import java.util.List;

public record RegistrationPageView(
        List<ReceptionQueueItem> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean first,
        boolean last
) {
}
