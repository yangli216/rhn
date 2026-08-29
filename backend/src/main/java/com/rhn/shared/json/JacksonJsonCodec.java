package com.rhn.shared.json;

import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
class JacksonJsonCodec implements JsonCodec {
    private final ObjectMapper objectMapper;

    JacksonJsonCodec(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public String write(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JacksonException exception) {
            throw new IllegalStateException("JSON serialization failed", exception);
        }
    }

    @Override
    public JsonNode readTree(String value) {
        try {
            return objectMapper.readTree(value);
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("Invalid JSON value", exception);
        }
    }

    @Override
    @SuppressWarnings("unchecked")
    public Map<String, Object> readObject(String value) {
        try {
            return objectMapper.readValue(value, LinkedHashMap.class);
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("Invalid JSON object", exception);
        }
    }
}
