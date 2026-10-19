package com.rhn.billing.application;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.util.Set;

/** 医保报文脱敏：凭证、证件号、签到流水完全遮蔽，人员编号和姓名保留首尾。不修改传入的节点。 */
final class ChsExchangeRedactor {
    private static final Set<String> SECRET = Set.of("mdtrt_cert_no", "certno", "card_sn", "sign_no", "cainfo", "dev_safe_info");
    private static final Set<String> NUMBER = Set.of("psn_no");
    private static final Set<String> NAME = Set.of("psn_name", "dr_name", "opter_name", "dise_dor_name", "bilg_dr_name", "emp_name");
    private static final int RAW_LIMIT = 80;

    private ChsExchangeRedactor() {}

    static JsonNode redact(JsonNode node) {
        if (node == null) return JsonNodeFactory.instance.nullNode();
        if (node.isObject()) {
            ObjectNode copy = JsonNodeFactory.instance.objectNode();
            for (var field : node.properties()) copy.set(field.getKey(), redactField(field.getKey(), field.getValue()));
            return copy;
        }
        if (node.isArray()) {
            ArrayNode copy = JsonNodeFactory.instance.arrayNode();
            node.forEach(item -> copy.add(redact(item)));
            return copy;
        }
        return node;
    }

    /** 非 JSON 回执无法按字段脱敏，只给长度和极短片段，避免把代理页或错误页内容带出服务端。 */
    static String describeRaw(String raw) {
        if (raw == null || raw.isEmpty()) return "（空回执）";
        String head = raw.substring(0, Math.min(RAW_LIMIT, raw.length())).replaceAll("\\p{Cntrl}", " ").replaceAll("\\d{6,}", "****");
        return "（非 JSON，共 " + raw.length() + " 字符）" + head;
    }

    private static JsonNode redactField(String key, JsonNode value) {
        if ((value.isObject() || value.isArray())) return redact(value);
        if (!value.isString()) return value;
        String text = value.asString();
        if (text.isEmpty()) return value;
        if (SECRET.contains(key)) return JsonNodeFactory.instance.stringNode("****");
        if (NUMBER.contains(key)) {
            return JsonNodeFactory.instance.stringNode(text.length() < 8 ? "****" : text.substring(0, 2) + "****" + text.substring(text.length() - 2));
        }
        if (NAME.contains(key)) return JsonNodeFactory.instance.stringNode(text.charAt(0) + "*".repeat(Math.max(1, text.length() - 1)));
        return value;
    }
}
