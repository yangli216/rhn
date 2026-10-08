package com.rhn.platform.configuration.application;

import com.rhn.platform.configuration.domain.ConfigurationValueType;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;

import static com.rhn.shared.api.BusinessErrors.badRequest;

/** A typed condition, shared by definition validation and runtime evaluation. */
record ConfigurationDependencyCondition(ConfigurationValueType type, Object expected) {
    static ConfigurationDependencyCondition parse(ConfigurationValueType type, String expression) {
        if (expression == null || expression.isBlank()) {
            throw badRequest("PARAMETER_DEPENDENCY_VALUE_REQUIRED", "必须指定满足依赖的前置期望值");
        }
        try {
            String text = expression.trim();
            if (type != ConfigurationValueType.JSON && text.startsWith("\"")) {
                JsonNode quoted = ConfigurationJson.read(text);
                if (!quoted.isString()) throw new IllegalArgumentException();
                text = quoted.asString();
            }
            Object expected = switch (type) {
                case STRING -> text;
                case BOOLEAN -> {
                    if (!"true".equalsIgnoreCase(text) && !"false".equalsIgnoreCase(text)) {
                        throw new IllegalArgumentException();
                    }
                    yield Boolean.valueOf(text);
                }
                case NUMBER -> new BigDecimal(text);
                case JSON -> {
                    JsonNode value = ConfigurationJson.read(text);
                    if (!value.isObject() && !value.isArray()) throw new IllegalArgumentException();
                    yield value;
                }
            };
            return new ConfigurationDependencyCondition(type, expected);
        } catch (RuntimeException invalid) {
            throw badRequest("PARAMETER_DEPENDENCY_VALUE_INVALID", "前置期望值必须与前置参数类型 " + type + " 一致");
        }
    }

    boolean matches(JsonNode actual) {
        boolean valid = actual != null && switch (type) {
            case STRING -> actual.isString();
            case BOOLEAN -> actual.isBoolean();
            case NUMBER -> actual.isNumber();
            case JSON -> actual.isObject() || actual.isArray();
        };
        if (!valid) throw badRequest("PARAMETER_DEPENDENCY_TYPE_MISMATCH", "前置参数实际值与声明类型 " + type + " 不一致");
        return switch (type) {
            case STRING -> actual.asString().equalsIgnoreCase((String) expected);
            case BOOLEAN -> actual.asBoolean() == (Boolean) expected;
            case NUMBER -> actual.decimalValue().compareTo((BigDecimal) expected) == 0;
            case JSON -> actual.equals(expected);
        };
    }
}
