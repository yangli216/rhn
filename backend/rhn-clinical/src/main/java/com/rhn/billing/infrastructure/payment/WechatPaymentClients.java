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

class WechatPaymentClients implements com.rhn.billing.api.PaymentChannelConfigurationAdapter {
    private final WechatPaymentProperties properties;
    private final com.rhn.billing.application.PaymentMerchantConfigurationStore settings;
    private final PaymentMockProperties mock;
    private final ConcurrentMap<String, ManagedClient> managedClients = new ConcurrentHashMap<>();
    private final ConcurrentMap<WechatMerchant, WxPayService> clients = new ConcurrentHashMap<>();
    WechatPaymentClients(WechatPaymentProperties properties, com.rhn.billing.application.PaymentMerchantConfigurationStore settings, PaymentMockProperties mock) { this.properties = properties; this.settings = settings; this.mock = mock; }
    boolean configured(Long tenantId, Long organizationId) {
        return settings.find(tenantId, organizationId, "WECHAT").map(com.rhn.billing.application.PaymentMerchantConfigurationStore.StoredPaymentConfiguration::enabled)
                .orElseGet(() -> PaymentMerchantSelection.configured(properties.merchants(), tenantId, organizationId));
    }
    void requireCollectionEnabled(Long tenantId, Long organizationId) {
        if (!configured(tenantId, organizationId)) throw badRequest("PAYMENT_CHANNEL_DISABLED", "当前机构未启用微信收款或未配置商户");
    }
    WechatMerchant merchant(Long tenantId, Long organizationId) {
        var stored = settings.find(tenantId, organizationId, "WECHAT");
        if (stored.isPresent()) {
            var values = stored.get().values();
            return new WechatMerchant(tenantId, organizationId, values.get("appId"), values.get("merchantId"), values.get("apiKey"), null, values.get("clientIp"));
        }
        var merchant = PaymentMerchantSelection.require(properties.merchants(), tenantId, organizationId);
        required(merchant.appId()); required(merchant.merchantId()); return merchant;
    }
    WxPayService client(WechatMerchant merchant) {
        var managed = settings.find(merchant.tenantId(), merchant.organizationId(), "WECHAT");
        if (managed.isEmpty()) return clients.computeIfAbsent(merchant, this::buildWechat);
        var values = managed.get().values();
        return managedClients.compute(merchant.tenantId() + "/" + merchant.organizationId(), (scope, old) ->
                old != null && old.values().equals(values) ? old : new ManagedClient(values, buildManaged(values))).client();
    }
    private record ManagedClient(java.util.Map<String,String> values, WxPayService client) {
        @Override public String toString() { return "ManagedClient[credentials=REDACTED]"; }
    }
    @Override public PaymentConfigurationDescriptor configurationDescriptor() {
        return new PaymentConfigurationDescriptor("WECHAT", "WECHAT_DIRECT", "微信支付", java.util.List.of(
                PaymentConfigurationFields.text("appId", "应用 AppID", true), PaymentConfigurationFields.text("merchantId", "直连商户号", true),
                PaymentConfigurationFields.text("clientIp", "业务终端／服务出口 IPv4", false),
                PaymentConfigurationFields.password("apiKey", "API v2 密钥"),
                PaymentConfigurationFields.file("certificate", "商户退款证书（PKCS12）", ".p12,.pfx", "BASE64", null)));
    }
    @Override public java.util.Map<String,String> deploymentConfiguration(Long tenantId, Long organizationId) {
        if (!PaymentMerchantSelection.configured(properties.merchants(), tenantId, organizationId)) return java.util.Map.of();
        var merchant = PaymentMerchantSelection.require(properties.merchants(), tenantId, organizationId);
        var values = new java.util.LinkedHashMap<String,String>();
        if (merchant.appId() != null) values.put("appId", merchant.appId());
        if (merchant.merchantId() != null) values.put("merchantId", merchant.merchantId());
        if (merchant.apiKey() != null) values.put("apiKey", merchant.apiKey());
        if (merchant.clientIp() != null) values.put("clientIp", merchant.clientIp());
        PaymentCredentialValidation.deploymentFile(values, "certificate", merchant.certificatePath(), true);
        return values;
    }
    @Override public void checkConfiguration(java.util.Map<String,String> values) {
        try {
            PaymentCredentialValidation.identity(values, "appId"); PaymentCredentialValidation.identity(values, "merchantId");
            if (!values.get("apiKey").matches("[\\x21-\\x7E]{32}")) throw new IllegalArgumentException("Invalid API v2 key");
            String ip = values.get("clientIp");
            if (ip == null || !ip.matches("(?:[0-9]{1,3}\\.){3}[0-9]{1,3}") || java.util.Arrays.stream(ip.split("\\.")).anyMatch(part -> Integer.parseInt(part) > 255)) throw new IllegalArgumentException("Invalid IPv4");
            PaymentCredentialValidation.p12(values.get("certificate"), values.get("merchantId"));
            buildManaged(values).getConfig().initSSLContext();
        } catch (Exception exception) { throw badRequest("PAYMENT_CREDENTIAL_INVALID", "微信 API v2 密钥或商户退款证书检测未通过"); }
    }
    private WxPayService buildManaged(java.util.Map<String,String> values) {
        try {
            WxPayConfig config = new WxPayConfig();
            config.setAppId(values.get("appId")); config.setMchId(values.get("merchantId")); config.setMchKey(values.get("apiKey"));
            config.setKeyContent(java.util.Base64.getDecoder().decode(values.get("certificate")));
            config.setHttpConnectionTimeout(5000); config.setHttpTimeout(15000);
            applyMockApiHost(config);
            var service = new WxPayServiceImpl(); service.setConfig(config); return service;
        } catch (RuntimeException exception) { throw badRequest("PAYMENT_CREDENTIAL_INVALID", "微信凭证配置不可用，请联系管理员"); }
    }

    private WxPayService buildWechat(WechatMerchant m) {
        required(m.apiKey()); required(m.certificatePath()); required(m.clientIp());
        if (m.apiKey().length() != 32 || !Files.isReadable(Path.of(m.certificatePath()))) {
            throw badRequest("PAYMENT_CREDENTIAL_INVALID", "微信支付 API v2 密钥或退款证书配置不可用");
        }
        WxPayConfig config = new WxPayConfig();
        config.setAppId(m.appId()); config.setMchId(m.merchantId()); config.setMchKey(m.apiKey());
        config.setKeyPath(m.certificatePath()); config.setHttpConnectionTimeout(5000); config.setHttpTimeout(15000);
        applyMockApiHost(config);
        var service = new WxPayServiceImpl(); service.setConfig(config); return service;
    }

    /** 仅在 test-only Mock 开关打开且地址非空时把请求指向本地 Mock；生产默认不设置，行为零变化。 */
    private void applyMockApiHost(WxPayConfig config) {
        if (mock != null && mock.enabled() && mock.wechatApiHostUrl() != null && !mock.wechatApiHostUrl().isBlank()) {
            config.setApiHostUrl(mock.wechatApiHostUrl());
        }
    }

    private static void required(String value) {
        if (value == null || value.isBlank()) throw badRequest("PAYMENT_CREDENTIAL_INVALID", "支付商户必需配置缺失，请联系管理员");
    }
}
