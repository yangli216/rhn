package com.rhn.billing.infrastructure.payment;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import java.util.List;

@ConfigurationProperties(prefix = "rhn.billing.payment.alipay", ignoreUnknownFields = false)
public record AlipayPaymentProperties(@DefaultValue("true") boolean enabled, List<AlipayMerchant> merchants) {
    public AlipayPaymentProperties {
        merchants = merchants == null ? List.of() : List.copyOf(merchants);
        PaymentMerchantSelection.validateScopes(merchants);
    }
    public record AlipayMerchant(Long tenantId, Long organizationId, String appId, String merchantId,
                                 String privateKeyPath, String publicKeyPath, String appCertPath,
                                 String alipayCertPath, String rootCertPath, String serverUrl)
            implements PaymentMerchantSelection.ScopedMerchant {
        @Override public String toString() { return "AlipayMerchant[credentials=REDACTED]"; }
    }
}
