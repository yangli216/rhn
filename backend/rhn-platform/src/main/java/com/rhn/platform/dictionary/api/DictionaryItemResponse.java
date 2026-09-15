package com.rhn.platform.dictionary.api;

import com.rhn.platform.dictionary.domain.DictionaryStatus;

public record DictionaryItemResponse(
        Long id,
        Long parentItemId,
        String parentItemCode,
        String code,
        String name,
        String description,
        int sortOrder,
        DictionaryStatus sdDictItemStatus
) {
}
