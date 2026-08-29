package com.rhn.platform.cryptography.spi;

public interface CryptographicProvider {
    ProviderDescriptor descriptor();

    DigestValue digest(byte[] content);

    DigestValue digest(String algorithm, byte[] content);

    SignatureMaterial sign(SigningCommand command);

    boolean verify(VerificationCommand command);
}
