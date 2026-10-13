package com.rhn.platform.configuration.api;

import java.util.List;

public record ParameterInitializationOptions(List<ParameterOption> parameters) {
    public record ParameterOption(String key, String name, String valueType) {}
}
