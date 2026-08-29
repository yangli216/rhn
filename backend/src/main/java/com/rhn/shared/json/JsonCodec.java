package com.rhn.shared.json;

import tools.jackson.databind.JsonNode;

import java.util.Map;

public interface JsonCodec {
    String write(Object value);

    JsonNode readTree(String value);

    Map<String, Object> readObject(String value);
}
