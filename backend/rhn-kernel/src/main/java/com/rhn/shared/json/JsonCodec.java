package com.rhn.shared.json;

import tools.jackson.databind.JsonNode;

import java.util.Map;

public interface JsonCodec {
    String write(Object value);

    JsonNode readTree(String value);

    /** Imported documents must not silently accept duplicate object keys. */
    default JsonNode readStrictTree(String value) { return StrictJsonReader.read(value); }

    /** Strict JSON for numeric constraints and values that must retain decimal precision. */
    static JsonNode readExactTree(String value) { return StrictJsonReader.readExact(value); }

    <T> T read(String value, Class<T> type);

    Map<String, Object> readObject(String value);
}
