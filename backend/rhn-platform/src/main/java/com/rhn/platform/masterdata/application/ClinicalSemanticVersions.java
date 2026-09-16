package com.rhn.platform.masterdata.application;

import com.rhn.shared.json.JsonCodec;
import tools.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.TreeMap;

/** Content versions are independent of mutable JPA revisions, display text and JSON key order. */
public final class ClinicalSemanticVersions {
    private ClinicalSemanticVersions() {}

    public static String hash(Object semanticValue, JsonCodec json) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(json.write(canonical(json.readTree(json.write(semanticValue))))
                            .getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static Object canonical(JsonNode node) {
        if (node.isObject()) {
            var result = new TreeMap<String, Object>();
            node.properties().forEach(entry -> result.put(entry.getKey(), canonical(entry.getValue())));
            return result;
        }
        if (node.isArray()) {
            var result = new ArrayList<Object>();
            node.forEach(value -> result.add(canonical(value)));
            return result;
        }
        if (node.isNull()) return null;
        if (node.isNumber()) return node.decimalValue().stripTrailingZeros();
        if (node.isBoolean()) return node.asBoolean();
        return node.asString();
    }
}
