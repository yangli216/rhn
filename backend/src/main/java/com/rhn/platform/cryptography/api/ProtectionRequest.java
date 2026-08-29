package com.rhn.platform.cryptography.api;

import java.util.Map;
import java.util.TreeMap;

public record ProtectionRequest(
        ProtectionProfile profile,
        String targetType,
        Long targetId,
        Long targetVersion,
        String operationCode,
        String contentSchema,
        byte[] content,
        Map<String, String> attributes
) {
    public ProtectionRequest {
        if (profile == null) throw new IllegalArgumentException("Protection profile is required");
        if (targetType == null || targetType.isBlank()) throw new IllegalArgumentException("Target type is required");
        if (targetId == null) throw new IllegalArgumentException("Target id is required");
        if (operationCode == null || operationCode.isBlank()) {
            throw new IllegalArgumentException("Operation code is required");
        }
        if (contentSchema == null || contentSchema.isBlank()) {
            throw new IllegalArgumentException("Content schema is required");
        }
        content = content == null ? new byte[0] : content.clone();
        attributes = attributes == null ? Map.of() : Map.copyOf(new TreeMap<>(attributes));
    }

    @Override
    public byte[] content() {
        return content.clone();
    }
}
