package com.rhn.platform.cryptography.infrastructure;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.util.Map;

/**
 * System signing key of the {@code software-sm} provider. {@code privateKey} is Base64 PKCS#8 or an
 * {@code enc:v1} value produced by the secret encryption service with binding {@link #SECRET_BINDING}.
 * {@code retiredPublicKeys} keeps rotated keys verifiable (keyId to Base64 X.509 public key).
 */
@ConfigurationProperties(prefix = "rhn.crypto.software-sm", ignoreUnknownFields = false)
public record SoftwareSmProperties(String keyId, String privateKey, @DefaultValue("false") boolean ephemeral,
                                   Map<String, String> retiredPublicKeys) {
    public static final String SECRET_BINDING = "rhn.crypto.software-sm.private-key";

    public SoftwareSmProperties {
        retiredPublicKeys = retiredPublicKeys == null ? Map.of() : Map.copyOf(retiredPublicKeys);
    }

    @Override
    public String toString() {
        return "SoftwareSmProperties[keyId=" + keyId + ", privateKey=REDACTED, ephemeral=" + ephemeral + "]";
    }
}
