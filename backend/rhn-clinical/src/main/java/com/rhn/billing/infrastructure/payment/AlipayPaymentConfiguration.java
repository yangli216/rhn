package com.rhn.billing.infrastructure.payment;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(AlipayPaymentProperties.class)
@ConditionalOnProperty(name = "rhn.billing.payment.aggregated-adapter.enabled", havingValue = "false", matchIfMissing = true)
@ConditionalOnProperty(name = "rhn.billing.payment.direct.enabled", havingValue = "true", matchIfMissing = true)
@ConditionalOnProperty(name = "rhn.billing.payment.alipay.enabled", havingValue = "true", matchIfMissing = true)
class AlipayPaymentConfiguration {
    @Bean AlipayPaymentClients alipayPaymentClients(AlipayPaymentProperties properties, com.rhn.billing.application.PaymentMerchantConfigurationStore settings) { return new AlipayPaymentClients(properties, settings); }
    @Bean AlipayPaymentChannelAdapter alipayPaymentChannelAdapter(AlipayPaymentClients clients) { return new AlipayPaymentChannelAdapter(clients); }
}
