package com.rhn.platform.cryptography.api;

/** Encrypts configuration secrets at rest. Plaintext must never be returned by administration APIs. */
public interface SecretEncryptionService {
    boolean available();

    String keyId();

    String encrypt(String plaintext, String binding);

    String decrypt(String ciphertext, String binding);
}
