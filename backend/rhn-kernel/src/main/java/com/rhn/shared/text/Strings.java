package com.rhn.shared.text;

/** 全库统一的文本校验与清洗工具，替代各模块私有的 requireText/trim 副本。 */
public final class Strings {
    private Strings() {
    }

    public static String trim(String value) {
        return value == null ? null : value.trim();
    }

    public static String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    public static <T> T require(T value, String label) {
        if (value == null) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        return value;
    }

    public static Long requireId(Long value, String label) {
        if (value == null || value <= 0) {
            throw new IllegalArgumentException(label + "标识不能为空");
        }
        return value;
    }

    public static String requireText(String value, String label, int max) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        String result = value.trim();
        if (result.length() > max) {
            throw new IllegalArgumentException(label + "长度不能超过" + max);
        }
        return result;
    }

    public static String optionalText(String value, int max) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String result = value.trim();
        if (result.length() > max) {
            throw new IllegalArgumentException("文本长度不能超过" + max);
        }
        return result;
    }
}
