package com.rhn.billing.application;

import com.rhn.billing.infrastructure.PaymentMerchantConfigurationRepository;
import com.rhn.platform.cryptography.api.SecretEncryptionService;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/** Runtime reads use the payment order institution, independent of the administrator's work context. */
@Service
public class PaymentMerchantConfigurationStore {
    private final PaymentMerchantConfigurationRepository repository;
    private final SecretEncryptionService encryption;
    private final JsonCodec json;
    public PaymentMerchantConfigurationStore(PaymentMerchantConfigurationRepository repository, SecretEncryptionService encryption, JsonCodec json) {
        this.repository = repository; this.encryption = encryption; this.json = json;
    }
    @Transactional(readOnly = true)
    public Optional<StoredPaymentConfiguration> find(Long tenantId, Long organizationId, String method) {
        return repository.findByTenantIdAndOrganizationIdAndPaymentMethodCode(tenantId, organizationId, method)
                .map(row -> new StoredPaymentConfiguration(row.enabled(), row.revision(), decode(row.encryptedValues(), tenantId, organizationId, method)));
    }
    Map<String, String> decode(String encryptedValues, Long tenantId, Long organizationId, String method) {
        Map<String, String> values = new LinkedHashMap<>();
        json.readObject(encryption.decrypt(encryptedValues, binding(tenantId, organizationId, method)))
                .forEach((key, value) -> values.put(key, (String) value));
        return values;
    }
    public static String binding(Long tenantId, Long organizationId, String method) { return "payment-merchant:" + tenantId + "/" + organizationId + "/" + method; }
    public record StoredPaymentConfiguration(boolean enabled, long revision, Map<String, String> values) {
        public StoredPaymentConfiguration { values = Map.copyOf(values); }
        @Override public String toString() { return "StoredPaymentConfiguration[credentials=REDACTED]"; }
    }
}
