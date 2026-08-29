package com.rhn.platform.configuration.domain;

import java.util.Locale;
import java.util.regex.Pattern;

public final class ConfigurationCodePolicy {
    public static final String PARAMETER_KEY_REGEX = "^[a-z][a-z0-9]*(?:[._-][a-z0-9]+){1,15}$";
    public static final String CATEGORY_CODE_REGEX = "^[A-Z][A-Z0-9_]{0,63}$";
    public static final String SCOPE_REFERENCE_REGEX = "^[A-Z0-9][A-Z0-9_.-]{0,127}$";
    private static final Pattern PARAMETER_KEY = Pattern.compile(PARAMETER_KEY_REGEX);
    private static final Pattern CATEGORY_CODE = Pattern.compile(CATEGORY_CODE_REGEX);
    private static final Pattern SCOPE_REFERENCE = Pattern.compile(SCOPE_REFERENCE_REGEX);

    private ConfigurationCodePolicy() {
    }

    public static String requireParameterKey(String value) {
        String normalized = require(value, "参数键").toLowerCase(Locale.ROOT);
        if (!PARAMETER_KEY.matcher(normalized).matches()) {
            throw new IllegalArgumentException("参数键必须使用小写分段命名，例如 outpatient.queue.max-size");
        }
        return normalized;
    }

    public static String requireCategoryCode(String value) {
        String normalized = require(value, "分类编码").toUpperCase(Locale.ROOT);
        if (!CATEGORY_CODE.matcher(normalized).matches()) {
            throw new IllegalArgumentException("分类编码只能使用大写字母、数字和下划线，且必须以字母开头");
        }
        return normalized;
    }

    public static String requireScopeReference(String value) {
        String normalized = require(value, "作用域引用").toUpperCase(Locale.ROOT);
        if (!SCOPE_REFERENCE.matcher(normalized).matches()) {
            throw new IllegalArgumentException("作用域引用只能使用大写字母、数字、下划线、点和连字符");
        }
        return normalized;
    }

    private static String require(String value, String label) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + "不能为空");
        return value.trim();
    }
}
