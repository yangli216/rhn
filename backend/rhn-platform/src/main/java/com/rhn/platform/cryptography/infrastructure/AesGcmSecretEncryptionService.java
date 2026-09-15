package com.rhn.platform.cryptography.infrastructure;

import com.rhn.platform.cryptography.api.SecretEncryptionService;
import com.rhn.shared.api.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

@Component
final class AesGcmSecretEncryptionService implements SecretEncryptionService {
    private static final String FORMAT = "enc:v1";
    private static final int NONCE_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKeySpec key;
    private final String keyId;
    private final SecureRandom random = new SecureRandom();

    AesGcmSecretEncryptionService(
            @Value("${rhn.crypto.secret-encryption-key:}") String encodedKey,
            @Value("${rhn.crypto.secret-encryption-key-id:primary}") String keyId) {
        this.keyId = keyId == null || keyId.isBlank() ? "primary" : keyId.trim();
        if (encodedKey == null || encodedKey.isBlank()) {
            this.key = null;
            return;
        }
        byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(encodedKey.trim());
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("RHN secret encryption key must be Base64 encoded", exception);
        }
        if (decoded.length != 32) {
            throw new IllegalArgumentException("RHN secret encryption key must decode to exactly 32 bytes");
        }
        this.key = new SecretKeySpec(decoded, "AES");
    }

    @Override
    public boolean available() {
        return key != null;
    }

    @Override
    public String keyId() {
        return keyId;
    }

    @Override
    public String encrypt(String plaintext, String binding) {
        requireAvailable();
        if (plaintext == null || plaintext.isBlank()) {
            throw new IllegalArgumentException("Secret plaintext must not be blank");
        }
        byte[] nonce = new byte[NONCE_BYTES];
        random.nextBytes(nonce);
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
            cipher.updateAAD(requireBinding(binding));
            byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
            return String.join(":", FORMAT, keyId, encoder.encodeToString(nonce), encoder.encodeToString(encrypted));
        } catch (GeneralSecurityException exception) {
            throw unavailable("配置密钥加密失败", exception);
        }
    }

    @Override
    public String decrypt(String ciphertext, String binding) {
        requireAvailable();
        if (ciphertext == null || ciphertext.isBlank()) return null;
        String[] parts = ciphertext.split(":", 5);
        if (parts.length != 5 || !"enc".equals(parts[0]) || !"v1".equals(parts[1]) || !keyId.equals(parts[2])) {
            throw unavailable("配置密钥格式或密钥版本不受支持", null);
        }
        try {
            Base64.Decoder decoder = Base64.getUrlDecoder();
            byte[] nonce = decoder.decode(parts[3]);
            if (nonce.length != NONCE_BYTES) throw new GeneralSecurityException("Invalid nonce length");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
            cipher.updateAAD(requireBinding(binding));
            return new String(cipher.doFinal(decoder.decode(parts[4])), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException exception) {
            throw unavailable("配置密钥解密或完整性校验失败", exception);
        }
    }

    private void requireAvailable() {
        if (!available()) throw unavailable("未配置服务端秘密加密主密钥", null);
    }

    private byte[] requireBinding(String binding) {
        if (binding == null || binding.isBlank()) throw new IllegalArgumentException("Secret binding must not be blank");
        return binding.getBytes(StandardCharsets.UTF_8);
    }

    private BusinessException unavailable(String message, Exception cause) {
        BusinessException exception = new BusinessException("SECRET_ENCRYPTION_UNAVAILABLE", message,
                HttpStatus.SERVICE_UNAVAILABLE);
        if (cause != null) exception.initCause(cause);
        return exception;
    }
}
