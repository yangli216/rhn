package com.rhn.analytics.semantic.model;

import java.util.List;

public record DefaultFilter(
    String field,
    Operator operator,
    List<String> values
) {
    public DefaultFilter {
        if (values != null) {
            values = List.copyOf(values);
        } else {
            values = List.of();
        }
    }

    public static DefaultFilter eq(String field, String value) {
        return new DefaultFilter(field, Operator.EQ, List.of(value));
    }

    public static DefaultFilter in(String field, List<String> values) {
        return new DefaultFilter(field, Operator.IN, values);
    }
}
