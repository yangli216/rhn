package com.rhn.platform.dictionary.api;

import com.rhn.platform.dictionary.domain.DictionaryScopeType;
import com.rhn.platform.dictionary.domain.DictionaryStatus;

import java.time.Instant;

public record DictionarySummaryResponse(
        Long id,
        long revision,
        DictionaryScopeType sdDictScopeType,
        String scopeCode,
        Long tenantId,
        Long categoryId,
        String categoryCode,
        String categoryName,
        String code,
        String name,
        String description,
        boolean systemManaged,
        DictionaryStatus sdDictStatus,
        long itemCount,
        Instant updatedAt,
        Long updatedBy
) {
}
