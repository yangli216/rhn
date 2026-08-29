package com.rhn.platform.dictionary.api;

import com.rhn.platform.dictionary.domain.DictionaryChangeTargetType;
import com.rhn.platform.dictionary.domain.DictionaryChangeType;
import tools.jackson.databind.JsonNode;

import java.time.Instant;

public record DictionaryChangeResponse(
        Long id,
        Long categoryId,
        Long dictionaryId,
        Long itemId,
        Long attributeDefinitionId,
        DictionaryChangeType sdDictChangeType,
        DictionaryChangeTargetType sdDictChangeTargetType,
        JsonNode before,
        JsonNode after,
        String reason,
        String requestCode,
        Instant changedAt,
        Long changedBy
) {
}
