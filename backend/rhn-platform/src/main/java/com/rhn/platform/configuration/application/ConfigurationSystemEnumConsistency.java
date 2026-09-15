package com.rhn.platform.configuration.application;

import com.rhn.platform.configuration.domain.ConfigurationCategory;
import com.rhn.platform.configuration.domain.ConfigurationChangeTargetType;
import com.rhn.platform.configuration.domain.ConfigurationChangeType;
import com.rhn.platform.configuration.domain.ConfigurationControlType;
import com.rhn.platform.configuration.domain.ConfigurationDisplayPolicy;
import com.rhn.platform.configuration.domain.ConfigurationScope;
import com.rhn.platform.configuration.domain.ConfigurationSensitivity;
import com.rhn.platform.configuration.domain.ConfigurationStatus;
import com.rhn.platform.configuration.domain.ConfigurationValueMode;
import com.rhn.platform.configuration.domain.ConfigurationValueType;
import com.rhn.platform.dictionary.api.SystemEnumDefinition;
import com.rhn.platform.dictionary.api.SystemEnumDirectory;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** Keeps the shared display catalog aligned without exposing configuration internals to the dictionary module. */
@Component
class ConfigurationSystemEnumConsistency {
    private final SystemEnumDirectory directory;

    ConfigurationSystemEnumConsistency(SystemEnumDirectory directory) {
        this.directory = directory;
    }

    @PostConstruct
    void verify() {
        Map<String, Class<? extends Enum<?>>> contracts = Map.of(
                "PARAM_SCOPE_TYPE", ConfigurationScope.class,
                "PARAM_VALUE_TYPE", ConfigurationValueType.class,
                "PARAM_CONTROL_TYPE", ConfigurationControlType.class,
                "PARAM_CONFIG_TYPE", ConfigurationCategory.class,
                "PARAM_SENSITIVITY", ConfigurationSensitivity.class,
                "PARAM_DISPLAY_POLICY", ConfigurationDisplayPolicy.class,
                "PARAM_STATUS", ConfigurationStatus.class,
                "PARAM_VALUE_MODE", ConfigurationValueMode.class,
                "PARAM_CHANGE_TYPE", ConfigurationChangeType.class,
                "PARAM_CHANGE_TARGET_TYPE", ConfigurationChangeTargetType.class);
        contracts.forEach(this::verifyDefinition);
    }

    private void verifyDefinition(String code, Class<? extends Enum<?>> enumType) {
        SystemEnumDefinition definition = directory.findSystemEnum(code)
                .orElseThrow(() -> new IllegalStateException("缺少参数系统枚举 " + code));
        Set<String> expected = Arrays.stream(enumType.getEnumConstants())
                .map(Enum::name).collect(Collectors.toUnmodifiableSet());
        Set<String> actual = definition.items().stream()
                .map(item -> item.code()).collect(Collectors.toUnmodifiableSet());
        if (definition.items().size() != actual.size() || !expected.equals(actual)) {
            throw new IllegalStateException(code + " 与 " + enumType.getSimpleName() + " 定义不一致");
        }
    }
}
