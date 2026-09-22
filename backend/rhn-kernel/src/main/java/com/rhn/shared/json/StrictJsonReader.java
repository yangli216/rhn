package com.rhn.shared.json;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.core.StreamReadFeature;

final class StrictJsonReader {
    private static final JsonMapper MAPPER=JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).enable(tools.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    private StrictJsonReader() {}
    static JsonNode read(String value) {
        try {return MAPPER.readTree(value);}
        catch(RuntimeException invalid) {throw new IllegalArgumentException("Invalid or ambiguous JSON document",invalid);}
    }
}
