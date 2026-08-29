package com.rhn.platform.dictionary.api;

public record SystemEnumItem(
        String code,
        String name,
        String description,
        int sortOrder
) {
}
