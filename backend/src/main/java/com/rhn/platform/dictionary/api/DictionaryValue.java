package com.rhn.platform.dictionary.api;

import java.util.Map;

public record DictionaryValue(String code, String name, int sortOrder, Map<String, String> attributes) {
    /** Backward-compatible constructor for callers that do not supply attributes. */
    public DictionaryValue(String code, String name, int sortOrder) {
        this(code, name, sortOrder, Map.of());
    }
}
