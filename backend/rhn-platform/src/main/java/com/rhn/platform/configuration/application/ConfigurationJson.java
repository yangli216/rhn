package com.rhn.platform.configuration.application;

import com.rhn.shared.json.JsonCodec;
import tools.jackson.databind.JsonNode;

/** Configuration numbers and constraints must not be rounded or accept ambiguous JSON. */
final class ConfigurationJson {
    private ConfigurationJson() {}

    static JsonNode read(String source) {
        JsonNode result = JsonCodec.readExactTree(source);
        if (result == null || result.isMissingNode()) throw new IllegalArgumentException("参数 JSON 内容不能为空");
        return result;
    }
}
