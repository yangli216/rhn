package com.rhn.platform.printing.api;

import java.util.Map;
import java.util.Collections;
import java.util.LinkedHashMap;

public record PrintRequest(
        String sourceType,
        Long sourceId,
        long sourceVersion,
        String documentType,
        Long residentId,
        Long encounterId,
        Long organizationId,
        Long departmentId,
        String purpose,
        int copies,
        String suggestedFileName,
        Map<String, Object> snapshot
) {
    public PrintRequest {
        snapshot = snapshot == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(snapshot));
    }
}
