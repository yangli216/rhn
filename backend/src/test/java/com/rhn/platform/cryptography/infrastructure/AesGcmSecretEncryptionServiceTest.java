package com.rhn.platform.cryptography.infrastructure;

import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AesGcmSecretEncryptionServiceTest {
    private static final String KEY = Base64.getEncoder()
            .encodeToString("0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8));
    private static final String BINDING = "scope:TENANT:1:parameter:ai.clinical.api-key";

    @Test
    void encryptsWithRandomNonceWithoutExposingPlaintext() {
        AesGcmSecretEncryptionService service = new AesGcmSecretEncryptionService(KEY, "test-key");

        String first = service.encrypt("clinical-secret", BINDING);
        String second = service.encrypt("clinical-secret", BINDING);

        assertThat(first).startsWith("enc:v1:test-key:").doesNotContain("clinical-secret");
        assertThat(second).startsWith("enc:v1:test-key:").doesNotContain("clinical-secret");
        assertThat(first).isNotEqualTo(second);
        assertThat(service.decrypt(first, BINDING)).isEqualTo("clinical-secret");
        assertThat(service.decrypt(second, BINDING)).isEqualTo("clinical-secret");
    }

    @Test
    void rejectsCiphertextWhenAssociatedDataDoesNotMatch() {
        AesGcmSecretEncryptionService service = new AesGcmSecretEncryptionService(KEY, "test-key");
        String ciphertext = service.encrypt("clinical-secret", BINDING);

        assertThatThrownBy(() -> service.decrypt(ciphertext,
                "scope:PLATFORM:parameter:ai.clinical.api-key"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("完整性校验失败");
    }

    @Test
    void reportsUnavailableWhenMasterKeyIsMissing() {
        AesGcmSecretEncryptionService service = new AesGcmSecretEncryptionService("", "test-key");

        assertThat(service.available()).isFalse();
        assertThatThrownBy(() -> service.encrypt("clinical-secret", BINDING))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("未配置服务端秘密加密主密钥");
    }

    @Test
    void rejectsMasterKeyWithWrongDecodedLength() {
        String shortKey = Base64.getEncoder().encodeToString(new byte[16]);

        assertThatThrownBy(() -> new AesGcmSecretEncryptionService(shortKey, "test-key"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("exactly 32 bytes");
    }
}
