package com.rhn.shared.event;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EventPayloadTest {
    @Test
    void readsNumbersWithoutLosingDecimalPrecision() {
        BigDecimal exact = new BigDecimal("12345678901234567890.123456");
        EventPayload payload = EventPayload.of(Map.of(
                "exact", exact,
                "number", 12.25,
                "text", "98.765432"));

        assertThat(payload.decimal("exact")).isSameAs(exact);
        assertThat(payload.decimal("number")).isEqualByComparingTo("12.25");
        assertThat(payload.decimal("text")).isEqualByComparingTo("98.765432");
    }

    @Test
    void readsLongFromNumberAndText() {
        EventPayload payload = EventPayload.of(Map.of("number", 42, "text", "73"));

        assertThat(payload.longValue("number")).isEqualTo(42L);
        assertThat(payload.requiredLong("text")).isEqualTo(73L);
        assertThat(payload.longValue("missing")).isNull();
    }

    @Test
    void rejectsMissingRequiredFields() {
        EventPayload payload = EventPayload.of(null);

        assertThatThrownBy(() -> payload.requiredLong("encounterId"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("事件缺少字段 encounterId");
        assertThatThrownBy(() -> payload.requiredText("eventType"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("事件缺少字段 eventType");
    }
}
