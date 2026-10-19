package com.rhn.billing.infrastructure.payment;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties({WechatPaymentProperties.class, PaymentMockProperties.class})
@ConditionalOnProperty(name = "rhn.billing.payment.aggregated-adapter.enabled", havingValue = "false", matchIfMissing = true)
@ConditionalOnProperty(name = "rhn.billing.payment.direct.enabled", havingValue = "true", matchIfMissing = true)
@ConditionalOnProperty(name = "rhn.billing.payment.wechat.enabled", havingValue = "true", matchIfMissing = true)
class WechatPaymentConfiguration {
    @Bean WechatPaymentClients wechatPaymentClients(WechatPaymentProperties properties, com.rhn.billing.application.PaymentMerchantConfigurationStore settings, PaymentMockProperties mock) { return new WechatPaymentClients(properties, settings, mock); }
    @Bean WechatPaymentChannelAdapter wechatPaymentChannelAdapter(WechatPaymentClients clients) { return new WechatPaymentChannelAdapter(clients); }
    @Bean WechatReconciliationAdapter wechatReconciliationAdapter(WechatPaymentClients clients) { return new WechatReconciliationAdapter(clients); }
}
