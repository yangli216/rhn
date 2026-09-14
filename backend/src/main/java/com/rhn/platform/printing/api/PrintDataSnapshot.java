package com.rhn.platform.printing.api;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

public record PrintDataSnapshot(
        String sourceType,
        Long sourceId,
        long sourceVersion,
        Long residentId,
        Long encounterId,
        Long organizationId,
        Long departmentId,
        String suggestedFileName,
        Map<String, Object> payload
) {
    public PrintDataSnapshot {
        payload = payload == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(payload));
    }
}
