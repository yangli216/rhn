package com.rhn.platform.cryptography.infrastructure;

import com.rhn.platform.cryptography.spi.CryptographicProvider;
import com.rhn.platform.cryptography.spi.DigestValue;
import com.rhn.platform.cryptography.spi.ProviderAssurance;
import com.rhn.platform.cryptography.spi.ProviderDescriptor;
import com.rhn.platform.cryptography.spi.SignatureMaterial;
import com.rhn.platform.cryptography.spi.SignerType;
import com.rhn.platform.cryptography.spi.SigningCommand;
import com.rhn.platform.cryptography.spi.VerificationCommand;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

@Component
@ConditionalOnProperty(prefix = "rhn.crypto", name = "active-provider", havingValue = "development-jca")
class DevelopmentJcaCryptographicProvider implements CryptographicProvider {
    private static final String PROVIDER_CODE = "development-jca";
    private static final String DIGEST_ALGORITHM = "SHA-256";
    private static final String SIGNATURE_ALGORITHM = "SHA256withECDSA";

    private final KeyPair keyPair;
    private final String keyId;

    DevelopmentJcaCryptographicProvider() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"));
            this.keyPair = generator.generateKeyPair();
            byte[] fingerprint = MessageDigest.getInstance(DIGEST_ALGORITHM)
                    .digest(keyPair.getPublic().getEncoded());
            this.keyId = "dev-" + HexFormat.of().formatHex(fingerprint, 0, 12);
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot initialize development cryptographic provider", exception);
        }
    }

    @Override
    public ProviderDescriptor descriptor() {
        return new ProviderDescriptor(PROVIDER_CODE, ProviderAssurance.DEVELOPMENT_ONLY,
                DIGEST_ALGORITHM, SIGNATURE_ALGORITHM);
    }

    @Override
    public DigestValue digest(byte[] content) {
        return digest(DIGEST_ALGORITHM, content);
    }

    @Override
    public DigestValue digest(String algorithm, byte[] content) {
        if (!DIGEST_ALGORITHM.equalsIgnoreCase(algorithm)) {
            throw new IllegalArgumentException("Unsupported development digest algorithm: " + algorithm);
        }
        try {
            return new DigestValue(DIGEST_ALGORITHM,
                    MessageDigest.getInstance(DIGEST_ALGORITHM).digest(content));
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot calculate development digest", exception);
        }
    }

    @Override
    public SignatureMaterial sign(SigningCommand command) {
        try {
            Signature signature = Signature.getInstance(SIGNATURE_ALGORITHM);
            signature.initSign(keyPair.getPrivate());
            signature.update(command.statement());
            return new SignatureMaterial(SIGNATURE_ALGORITHM, keyId, SignerType.SYSTEM, null,
                    "RHN development application", Base64.getEncoder().encodeToString(signature.sign()),
                    Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded()),
                    null, null, Instant.now(), null, null);
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot create development signature", exception);
        }
    }

    @Override
    public boolean verify(VerificationCommand command) {
        try {
            if (!SIGNATURE_ALGORITHM.equalsIgnoreCase(command.signatureAlgorithm())) return false;
            PublicKey publicKey = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(
                    Base64.getDecoder().decode(command.verificationMaterial())));
            Signature signature = Signature.getInstance(SIGNATURE_ALGORITHM);
            signature.initVerify(publicKey);
            signature.update(command.statement());
            return signature.verify(Base64.getDecoder().decode(command.signatureValue()));
        } catch (Exception exception) {
            return false;
        }
    }
}
