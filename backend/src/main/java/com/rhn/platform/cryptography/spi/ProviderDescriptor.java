package com.rhn.platform.cryptography.spi;

public record ProviderDescriptor(
        String providerCode,
        ProviderAssurance assurance,
        String defaultDigestAlgorithm,
        String defaultSignatureAlgorithm
) {}
