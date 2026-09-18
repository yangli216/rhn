package com.rhn.analytics.semantic;

import com.rhn.shared.json.JsonCodec;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.util.LinkedHashMap;
import java.util.Map;

public final class TestJsonCodec implements JsonCodec {
    private final ObjectMapper objectMapper = JsonMapper.builder().findAndAddModules().build();

    @Override public String write(Object value) { return objectMapper.writeValueAsString(value); }
    @Override public JsonNode readTree(String value) { return objectMapper.readTree(value); }
    @Override public <T> T read(String value, Class<T> type) { return objectMapper.readValue(value, type); }
    @Override @SuppressWarnings("unchecked")
    public Map<String, Object> readObject(String value) { return objectMapper.readValue(value, LinkedHashMap.class); }
}
