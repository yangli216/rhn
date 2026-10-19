package com.rhn.platform.cryptography.infrastructure;

import com.rhn.platform.cryptography.api.SecretEncryptionService;
import com.rhn.platform.cryptography.spi.CryptographicProvider;
import com.rhn.platform.cryptography.spi.DigestValue;
import com.rhn.platform.cryptography.spi.ProviderAssurance;
import com.rhn.platform.cryptography.spi.ProviderDescriptor;
import com.rhn.platform.cryptography.spi.SignatureMaterial;
import com.rhn.platform.cryptography.spi.SignerType;
import com.rhn.platform.cryptography.spi.SigningCommand;
import com.rhn.platform.cryptography.spi.VerificationCommand;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

import java.security.KeyPair;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

/**
 * Production system signer (ADR-008): SM3 digests and SM3withSM2 signatures with an application key.
 * Assurance is {@link ProviderAssurance#SOFTWARE}; verification only trusts keys registered in
 * configuration, never the public key carried by evidence.
 */
@Component
@EnableConfigurationProperties(SoftwareSmProperties.class)
@ConditionalOnProperty(prefix = "rhn.crypto", name = "active-provider", havingValue = SoftwareSmCryptographicProvider.CODE)
class SoftwareSmCryptographicProvider implements CryptographicProvider {
    static final String CODE = "software-sm";

    private final PrivateKey privateKey;
    private final String keyId;
    private final Map<String, PublicKey> verificationKeys;

    SoftwareSmCryptographicProvider(SoftwareSmProperties properties, SecretEncryptionService secrets) {
        KeyPair keyPair = keyPair(properties, secrets);
        this.privateKey = keyPair.getPrivate();
        this.keyId = properties.keyId() == null || properties.keyId().isBlank()
                ? "sm-" + SmCrypto.sm3Hex(keyPair.getPublic().getEncoded()).substring(0, 24)
                : properties.keyId().trim();
        Map<String, PublicKey> keys = new HashMap<>();
        properties.retiredPublicKeys().forEach((id, key) ->
                keys.put(id, SmCrypto.publicKey(Base64.getDecoder().decode(key.trim()))));
        if (keys.containsKey(this.keyId)) {
            throw new IllegalStateException("software-sm retired key id duplicates the active key id: " + this.keyId);
        }
        keys.put(this.keyId, keyPair.getPublic());
        this.verificationKeys = Map.copyOf(keys);
    }

    @Override
    public ProviderDescriptor descriptor() {
        return new ProviderDescriptor(CODE, ProviderAssurance.SOFTWARE, SmCrypto.SM3, SmCrypto.SM2_SIGNATURE);
    }

    @Override
    public DigestValue digest(byte[] content) {
        return digest(SmCrypto.SM3, content);
    }

    @Override
    public DigestValue digest(String algorithm, byte[] content) {
        if (!SmCrypto.SM3.equalsIgnoreCase(algorithm)) {
            throw new IllegalArgumentException("software-sm only produces SM3 digests: " + algorithm);
        }
        return new DigestValue(SmCrypto.SM3, SmCrypto.digest(SmCrypto.SM3, content));
    }

    @Override
    public SignatureMaterial sign(SigningCommand command) {
        String signature = Base64.getEncoder().encodeToString(SmCrypto.sign(privateKey, command.statement()));
        return new SignatureMaterial(SmCrypto.SM2_SIGNATURE, keyId, SignerType.SYSTEM, null,
                "RHN system signer", signature, null, null, null, Instant.now(), null, null);
    }

    @Override
    public boolean verify(VerificationCommand command) {
        if (!SmCrypto.SM2_SIGNATURE.equalsIgnoreCase(command.signatureAlgorithm())) return false;
        PublicKey key = verificationKeys.get(command.keyId());
        if (key == null) return false;
        try {
            return SmCrypto.verify(key, command.statement(), Base64.getDecoder().decode(command.signatureValue()));
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static KeyPair keyPair(SoftwareSmProperties properties, SecretEncryptionService secrets) {
        String configured = properties.privateKey() == null ? "" : properties.privateKey().trim();
        if (configured.isEmpty()) {
            if (!properties.ephemeral()) {
                throw new IllegalStateException("rhn.crypto.software-sm.private-key is required unless ephemeral=true");
            }
            return SmCrypto.generateKeyPair();
        }
        String encoded = configured.startsWith("enc:")
                ? secrets.decrypt(configured, SoftwareSmProperties.SECRET_BINDING)
                : configured;
        PrivateKey key = SmCrypto.privateKey(Base64.getDecoder().decode(encoded.trim()));
        return new KeyPair(SmCrypto.publicKeyOf(key), key);
    }
}
