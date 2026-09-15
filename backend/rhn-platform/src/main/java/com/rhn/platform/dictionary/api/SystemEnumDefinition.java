package com.rhn.platform.dictionary.api;

import java.util.List;

public record SystemEnumDefinition(
        String code,
        String name,
        String description,
        List<SystemEnumItem> items
) {
    public SystemEnumDefinition {
        items = List.copyOf(items);
    }
}
