package com.rhn.billing.infrastructure.payment;

import com.github.binarywang.wxpay.config.WxPayConfig;
import com.github.binarywang.wxpay.service.WxPayService;
import com.github.binarywang.wxpay.service.impl.WxPayServiceImpl;
import com.rhn.billing.infrastructure.payment.WechatPaymentProperties.WechatMerchant;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import static com.rhn.shared.api.BusinessErrors.badRequest;

class WechatPaymentClients {
    private final WechatPaymentProperties properties;
    private final ConcurrentMap<WechatMerchant, WxPayService> clients = new ConcurrentHashMap<>();
    WechatPaymentClients(WechatPaymentProperties properties) { this.properties = properties; }
    boolean configured(Long tenantId, Long organizationId) { return PaymentMerchantSelection.configured(properties.merchants(), tenantId, organizationId); }
    WechatMerchant merchant(Long tenantId, Long organizationId) {
        var merchant = PaymentMerchantSelection.require(properties.merchants(), tenantId, organizationId);
        required(merchant.appId()); required(merchant.merchantId()); return merchant;
    }
    WxPayService client(WechatMerchant merchant) { return clients.computeIfAbsent(merchant, this::buildWechat); }

    private WxPayService buildWechat(WechatMerchant m) {
        required(m.apiKey()); required(m.certificatePath()); required(m.clientIp());
        if (m.apiKey().length() != 32 || !Files.isReadable(Path.of(m.certificatePath()))) {
            throw badRequest("PAYMENT_CREDENTIAL_INVALID", "微信支付 API v2 密钥或退款证书配置不可用");
        }
        WxPayConfig config = new WxPayConfig();
        config.setAppId(m.appId()); config.setMchId(m.merchantId()); config.setMchKey(m.apiKey());
        config.setKeyPath(m.certificatePath()); config.setHttpConnectionTimeout(5000); config.setHttpTimeout(15000);
        var service = new WxPayServiceImpl(); service.setConfig(config); return service;
    }

    private static void required(String value) {
        if (value == null || value.isBlank()) throw badRequest("PAYMENT_CREDENTIAL_INVALID", "支付商户必需配置缺失，请联系管理员");
    }
}
