package com.rhn.billing.infrastructure.payment;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * 本地三方 Mock 联调开关（test-only）。默认关闭：关闭时网关地址白名单与 SDK 基址完全等同生产口径，
 * 且 {@code configurationDescriptor()} 不变，管理页仍只提供官方/沙箱环境。
 *
 * <p>开启后仅放宽两点：支付宝网关地址白名单追加 {@code alipayGatewayUrl}；微信 SDK 基址覆盖为
 * {@code wechatApiHostUrl}。通过 {@code application-paymentmock.yml} 在测试中打开，生产不配置。
 */
@ConfigurationProperties(prefix = "rhn.billing.payment.mock", ignoreUnknownFields = false)
public record PaymentMockProperties(@DefaultValue("false") boolean enabled, String alipayGatewayUrl, String wechatApiHostUrl) {
}
