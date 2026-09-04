package com.rhn.shared.event;

import java.math.BigDecimal;
import java.util.Map;

/** 领域事件 payload 取数助手，替代各投影器私有的 longValue/decimal/text 副本。 */
public final class EventPayload {
    private final Map<?, ?> payload;

    private EventPayload(Map<?, ?> payload) {
        this.payload = payload == null ? Map.of() : payload;
    }

    public static EventPayload of(Map<?, ?> payload) {
        return new EventPayload(payload);
    }

    public Long longValue(String key) {
        Object value = payload.get(key);
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            return Long.valueOf(text);
        }
        return null;
    }

    public long requiredLong(String key) {
        Long value = longValue(key);
        if (value == null) {
            throw new IllegalArgumentException("事件缺少字段 " + key);
        }
        return value;
    }

    public BigDecimal decimal(String key) {
        Object value = payload.get(key);
        if (value instanceof BigDecimal decimal) {
            return decimal;
        }
        if (value instanceof Number number) {
            return new BigDecimal(number.toString());
        }
        if (value instanceof String text && !text.isBlank()) {
            return new BigDecimal(text);
        }
        return null;
    }

    public String text(String key) {
        Object value = payload.get(key);
        return value == null ? null : value.toString();
    }

    public String requiredText(String key) {
        String value = text(key);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("事件缺少字段 " + key);
        }
        return value;
    }
}
