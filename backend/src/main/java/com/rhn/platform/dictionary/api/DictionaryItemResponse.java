package com.rhn.platform.dictionary.api;

import com.rhn.platform.dictionary.domain.DictionaryStatus;

public record DictionaryItemResponse(
        Long id,
        String code,
        String name,
        String description,
        int sortOrder,
        DictionaryStatus sdDictItemStatus
) {
}
