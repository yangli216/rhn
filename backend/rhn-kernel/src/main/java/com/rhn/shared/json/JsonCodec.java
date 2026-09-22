package com.rhn.shared.json;

import tools.jackson.databind.JsonNode;

import java.util.Map;

public interface JsonCodec {
    String write(Object value);

    JsonNode readTree(String value);

    /** Imported documents must not silently accept duplicate object keys. */
    default JsonNode readStrictTree(String value) { return StrictJsonReader.read(value); }

    <T> T read(String value, Class<T> type);

    Map<String, Object> readObject(String value);
}
