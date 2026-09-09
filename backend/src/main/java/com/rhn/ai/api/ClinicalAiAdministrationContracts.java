package com.rhn.ai.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import tools.jackson.databind.JsonNode;

import java.util.List;

public final class ClinicalAiAdministrationContracts {
    private ClinicalAiAdministrationContracts() {
    }

    public enum Scope {
        PLATFORM, TENANT
    }

    public record ConfigurationView(
            Scope scope,
            boolean canManagePlatform,
            boolean encryptionAvailable,
            String encryptionKeyId,
            RuntimeStatus runtime,
            List<SettingView> settings) {
    }

    public record RuntimeStatus(
            String mode,
            boolean assistantReady,
            boolean modelReady,
            boolean speechReady,
            boolean knowledgeReady,
            String provider,
            String model) {
    }

    public record SettingView(
            String key,
            String group,
            String name,
            String description,
            String valueType,
            boolean secret,
            JsonNode effectiveValue,
            String sourceScope,
            boolean inherited,
            boolean secretConfigured,
            boolean overridePresent,
            Long overrideRevision,
            boolean overrideActive) {
        public SettingView {
            effectiveValue = effectiveValue == null ? null : effectiveValue.deepCopy();
        }

        @Override
        public JsonNode effectiveValue() {
            return effectiveValue == null ? null : effectiveValue.deepCopy();
        }
    }

    public record UpdateRequest(
            @NotNull Scope scope,
            @NotEmpty @Size(max = 16) List<@Valid SettingUpdate> settings,
            @Size(max = 1000) String reason) {
    }

    public record SettingUpdate(
            @NotBlank @Size(max = 160) String key,
            JsonNode value,
            @Size(max = 500) String secretValue,
            Boolean clearSecret,
            Boolean clearOverride,
            Long expectedRevision) {
        public SettingUpdate {
            value = value == null ? null : value.deepCopy();
        }

        @Override
        public JsonNode value() {
            return value == null ? null : value.deepCopy();
        }
    }

    public record ConfigurationTestRequest(
            @NotNull Scope scope,
            @NotBlank String target,
            String endpoint,
            String model,
            @Size(max = 500) String secretValue,
            Integer timeoutSeconds) {
    }

    public record ConfigurationTestResult(
            String target,
            boolean success,
            int statusCode,
            long latencyMs,
            String message,
            String rawDetail) {
    }
}

