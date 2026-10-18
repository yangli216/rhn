package com.rhn.billing.infrastructure.payment;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import java.util.List;

@ConfigurationProperties(prefix = "rhn.billing.payment.wechat", ignoreUnknownFields = false)
public record WechatPaymentProperties(@DefaultValue("true") boolean enabled, List<WechatMerchant> merchants) {
    public WechatPaymentProperties {
        merchants = merchants == null ? List.of() : List.copyOf(merchants);
        PaymentMerchantSelection.validateScopes(merchants);
    }
    public record WechatMerchant(Long tenantId, Long organizationId, String appId, String merchantId,
                                 String apiKey, String certificatePath, String clientIp)
            implements PaymentMerchantSelection.ScopedMerchant {
        @Override public String toString() { return "WechatMerchant[credentials=REDACTED]"; }
    }
}
