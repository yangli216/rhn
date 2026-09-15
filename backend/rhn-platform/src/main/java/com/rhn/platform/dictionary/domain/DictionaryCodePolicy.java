package com.rhn.platform.dictionary.domain;

import java.util.Locale;
import java.util.regex.Pattern;

public final class DictionaryCodePolicy {
    public static final String DICTIONARY_CODE_REGEX = "^[A-Z][A-Z0-9_]{0,63}$";
    public static final String CATEGORY_CODE_REGEX = DICTIONARY_CODE_REGEX;
    public static final String ITEM_CODE_REGEX = "^[A-Z0-9][A-Z0-9_.-]{0,127}$";
    private static final Pattern DICTIONARY_CODE = Pattern.compile(DICTIONARY_CODE_REGEX);
    private static final Pattern ITEM_CODE = Pattern.compile(ITEM_CODE_REGEX);

    private DictionaryCodePolicy() {
    }

    public static String requireDictionaryCode(String value) {
        String normalized = normalize(value);
        if (!DICTIONARY_CODE.matcher(normalized).matches()) {
            throw new IllegalArgumentException("字典编码只能使用大写字母、数字和下划线，且必须以字母开头");
        }
        return normalized;
    }

    public static String requireCategoryCode(String value) {
        String normalized = normalize(value);
        if (!DICTIONARY_CODE.matcher(normalized).matches()) {
            throw new IllegalArgumentException("字典分类编码只能使用大写字母、数字和下划线，且必须以字母开头");
        }
        return normalized;
    }

    public static String requireItemCode(String value) {
        String normalized = normalize(value);
        if (!ITEM_CODE.matcher(normalized).matches()) {
            throw new IllegalArgumentException("字典项编码只能使用大写字母、数字、下划线、点和连字符");
        }
        return normalized;
    }

    private static String normalize(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("编码不能为空");
        }
        return value.trim().toUpperCase(Locale.ROOT);
    }
}
