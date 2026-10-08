package com.rhn.platform.configuration.application;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ConfigurationJsonTest {
    @ParameterizedTest
    @ValueSource(strings = {"9007199254740993", "0.12345678901234567890123456789", "-0.000000000000000000001", "1e400", "1e-400", "1.0000"})
    void keeps_numbers_exact_at_the_root_and_in_nested_json(String number) {
        assertThat(ConfigurationJson.read(number).decimalValue()).isEqualByComparingTo(new BigDecimal(number));
        assertThat(ConfigurationJson.read("{\"nested\":[" + number + "]}").get("nested").get(0).decimalValue())
                .isEqualByComparingTo(new BigDecimal(number));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "{} []", "true false", "{\"a\":1,\"a\":2}", "{\"o\":{\"a\":1,\"\\u0061\":2}}", "[1,]"})
    void rejects_ambiguous_or_incomplete_documents(String json) {
        assertThrows(RuntimeException.class, () -> ConfigurationJson.read(json));
    }
}
