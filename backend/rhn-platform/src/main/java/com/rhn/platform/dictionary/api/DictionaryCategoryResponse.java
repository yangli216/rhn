package com.rhn.platform.dictionary.api;

import com.rhn.platform.dictionary.domain.DictionaryScopeType;
import com.rhn.platform.dictionary.domain.DictionaryStatus;

import java.time.Instant;

public record DictionaryCategoryResponse(
        Long id,
        long revision,
        DictionaryScopeType sdDictScopeType,
        String scopeCode,
        Long tenantId,
        Long parentId,
        String code,
        String name,
        String description,
        int sortOrder,
        DictionaryStatus sdDictCategoryStatus,
        long dictionaryCount,
        Instant createdAt,
        Long createdBy,
        Instant updatedAt,
        Long updatedBy
) {
}

