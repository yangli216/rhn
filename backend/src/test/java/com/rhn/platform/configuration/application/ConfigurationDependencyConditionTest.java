package com.rhn.platform.configuration.application;

import com.rhn.platform.configuration.domain.ConfigurationValueType;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ConfigurationDependencyConditionTest {

    @ParameterizedTest
    @MethodSource("validConditions")
    void compares_values_by_declared_type(ConfigurationValueType type, String expected, String actual, boolean matches) {
        assertThat(ConfigurationDependencyCondition.parse(type, expected).matches(ConfigurationJson.read(actual)))
                .isEqualTo(matches);
    }

    static Stream<Arguments> validConditions() {
        return Stream.of(
                Arguments.of(ConfigurationValueType.BOOLEAN, "true", "true", true),
                Arguments.of(ConfigurationValueType.BOOLEAN, "false", "true", false),
                Arguments.of(ConfigurationValueType.BOOLEAN, "FALSE", "false", true),
                Arguments.of(ConfigurationValueType.BOOLEAN, "\"false\"", "false", true),
                Arguments.of(ConfigurationValueType.NUMBER, "1.00", "1", true),
                Arguments.of(ConfigurationValueType.NUMBER, "\"2\"", "2", true),
                Arguments.of(ConfigurationValueType.NUMBER, "3", "2", false),
                Arguments.of(ConfigurationValueType.STRING, "MODEL", "\"model\"", true),
                Arguments.of(ConfigurationValueType.STRING, "\"line\\nend\"", "\"line\\nend\"", true),
                Arguments.of(ConfigurationValueType.JSON, "{\"a\":1,\"b\":true}", "{\"b\":true, \"a\":1}", true),
                Arguments.of(ConfigurationValueType.JSON, "[1,2]", "[2,1]", false),
                Arguments.of(ConfigurationValueType.NUMBER, "1.00000000000000000001", "1.00000000000000000001", true),
                Arguments.of(ConfigurationValueType.NUMBER, "1.00000000000000000001", "1.00000000000000000002", false),
                Arguments.of(ConfigurationValueType.NUMBER, "1e-400", "1e-400", true),
                Arguments.of(ConfigurationValueType.JSON, "{\"n\":1.00000000000000000001}", "{\"n\":1.00000000000000000001}", true),
                Arguments.of(ConfigurationValueType.JSON, "{\"n\":1.00000000000000000001}", "{\"n\":1.00000000000000000002}", false));
    }

    @ParameterizedTest
    @MethodSource("invalidConditions")
    void rejects_invalid_expectations_instead_of_coercing_them(ConfigurationValueType type, String expected) {
        BusinessException error = assertThrows(BusinessException.class,
                () -> ConfigurationDependencyCondition.parse(type, expected));
        assertThat(error.code()).isEqualTo("PARAMETER_DEPENDENCY_VALUE_INVALID");
    }

    static Stream<Arguments> invalidConditions() {
        return Stream.of(
                Arguments.of(ConfigurationValueType.BOOLEAN, "flase"),
                Arguments.of(ConfigurationValueType.BOOLEAN, "0"),
                Arguments.of(ConfigurationValueType.BOOLEAN, "yes"),
                Arguments.of(ConfigurationValueType.BOOLEAN, "\"false\" trailing"),
                Arguments.of(ConfigurationValueType.NUMBER, "NaN"),
                Arguments.of(ConfigurationValueType.NUMBER, "10mg"),
                Arguments.of(ConfigurationValueType.JSON, "false"),
                Arguments.of(ConfigurationValueType.JSON, "{\"a\":1,\"a\":2}"),
                Arguments.of(ConfigurationValueType.JSON, "{} []"));
    }

    @Test
    void a_string_false_cannot_satisfy_a_boolean_false_condition() {
        var condition = ConfigurationDependencyCondition.parse(ConfigurationValueType.BOOLEAN, "false");
        BusinessException error = assertThrows(BusinessException.class,
                () -> condition.matches(ConfigurationJson.read("\"false\"")));
        assertThat(error.code()).isEqualTo("PARAMETER_DEPENDENCY_TYPE_MISMATCH");
    }
}
