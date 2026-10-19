package com.rhn.billing.infrastructure.payment;

import com.alipay.api.AlipayClient;
import com.alipay.api.AlipayConfig;
import com.alipay.api.DefaultAlipayClient;
import com.rhn.billing.infrastructure.payment.AlipayPaymentProperties.AlipayMerchant;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import static com.rhn.shared.api.BusinessErrors.badRequest;

class AlipayPaymentClients implements com.rhn.billing.api.PaymentChannelConfigurationAdapter {
    private final AlipayPaymentProperties properties;
    private final com.rhn.billing.application.PaymentMerchantConfigurationStore settings;
    private final ConcurrentMap<String, ManagedClient> managedClients = new ConcurrentHashMap<>();
    private final ConcurrentMap<AlipayMerchant, AlipayClient> clients = new ConcurrentHashMap<>();
    AlipayPaymentClients(AlipayPaymentProperties properties, com.rhn.billing.application.PaymentMerchantConfigurationStore settings) {
        this.settings = settings;
        this.properties = properties;
        com.alipay.api.internal.util.AlipayLogger.setNeedEnableLogger(false);
        com.alipay.api.internal.util.AlipayLogger.setJDKDebugEnabled(false);
    }
    boolean configured(Long tenantId, Long organizationId) {
        return settings.find(tenantId, organizationId, "ALIPAY").map(com.rhn.billing.application.PaymentMerchantConfigurationStore.StoredPaymentConfiguration::enabled)
                .orElseGet(() -> PaymentMerchantSelection.configured(properties.merchants(), tenantId, organizationId));
    }
    void requireCollectionEnabled(Long tenantId, Long organizationId) {
        if (!configured(tenantId, organizationId)) throw badRequest("PAYMENT_CHANNEL_DISABLED", "当前机构未启用支付宝收款或未配置商户");
    }
    AlipayMerchant merchant(Long tenantId, Long organizationId) {
        var stored = settings.find(tenantId, organizationId, "ALIPAY");
        if (stored.isPresent()) {
            var values = stored.get().values();
            return new AlipayMerchant(tenantId, organizationId, values.get("appId"), values.get("merchantId"), null, null, null, null, null, values.get("serverUrl"));
        }
        var merchant = PaymentMerchantSelection.require(properties.merchants(), tenantId, organizationId);
        required(merchant.appId()); required(merchant.merchantId()); return merchant;
    }
    AlipayClient client(AlipayMerchant merchant) {
        var managed = settings.find(merchant.tenantId(), merchant.organizationId(), "ALIPAY");
        if (managed.isEmpty()) return clients.computeIfAbsent(merchant, this::buildAlipay);
        var values = managed.get().values();
        return managedClients.compute(merchant.tenantId() + "/" + merchant.organizationId(), (scope, old) ->
                old != null && old.values().equals(values) ? old : new ManagedClient(values, buildManaged(values))).client();
    }
    boolean certificateMode(AlipayMerchant merchant) {
        return settings.find(merchant.tenantId(), merchant.organizationId(), "ALIPAY").map(value -> "CERTIFICATE".equals(value.values().get("keyMode")))
                .orElse(merchant.appCertPath() != null);
    }
    private record ManagedClient(java.util.Map<String,String> values, AlipayClient client) {
        @Override public String toString() { return "ManagedClient[credentials=REDACTED]"; }
    }
    @Override public PaymentConfigurationDescriptor configurationDescriptor() {
        return new PaymentConfigurationDescriptor("ALIPAY", "ALIPAY_DIRECT", "支付宝", java.util.List.of(
                PaymentConfigurationFields.text("appId", "应用 ID", true), PaymentConfigurationFields.text("merchantId", "商户 PID", true),
                PaymentConfigurationFields.choice("serverUrl", "支付环境", true,
                        new PaymentConfigurationOption("https://openapi.alipay.com/gateway.do", "正式环境"),
                        new PaymentConfigurationOption("https://openapi-sandbox.dl.alipaydev.com/gateway.do", "沙箱环境")),
                PaymentConfigurationFields.choice("keyMode", "凭证模式", true,
                        new PaymentConfigurationOption("PUBLIC_KEY", "公钥模式"), new PaymentConfigurationOption("CERTIFICATE", "证书模式")),
                PaymentConfigurationFields.file("privateKey", "应用私钥（PKCS8）", ".pem,.key,.txt", "UTF8", null),
                PaymentConfigurationFields.file("publicKey", "支付宝公钥", ".pem,.key,.txt", "UTF8", "PUBLIC_KEY"),
                PaymentConfigurationFields.file("appCertificate", "应用公钥证书", ".crt,.cer,.pem", "UTF8", "CERTIFICATE"),
                PaymentConfigurationFields.file("alipayCertificate", "支付宝公钥证书", ".crt,.cer,.pem", "UTF8", "CERTIFICATE"),
                PaymentConfigurationFields.file("rootCertificate", "支付宝根证书", ".crt,.cer,.pem", "UTF8", "CERTIFICATE")));
    }
    @Override public java.util.Map<String,String> deploymentConfiguration(Long tenantId, Long organizationId) {
        if (!PaymentMerchantSelection.configured(properties.merchants(), tenantId, organizationId)) return java.util.Map.of();
        var merchant = PaymentMerchantSelection.require(properties.merchants(), tenantId, organizationId);
        var values = new java.util.LinkedHashMap<String,String>();
        if (merchant.appId() != null) values.put("appId", merchant.appId());
        if (merchant.merchantId() != null) values.put("merchantId", merchant.merchantId());
        values.put("serverUrl", merchant.serverUrl() == null ? "https://openapi.alipay.com/gateway.do" : merchant.serverUrl());
        values.put("keyMode", merchant.appCertPath() == null ? "PUBLIC_KEY" : "CERTIFICATE");
        PaymentCredentialValidation.deploymentFile(values, "privateKey", merchant.privateKeyPath(), false);
        PaymentCredentialValidation.deploymentFile(values, "publicKey", merchant.publicKeyPath(), false);
        PaymentCredentialValidation.deploymentFile(values, "appCertificate", merchant.appCertPath(), false);
        PaymentCredentialValidation.deploymentFile(values, "alipayCertificate", merchant.alipayCertPath(), false);
        PaymentCredentialValidation.deploymentFile(values, "rootCertificate", merchant.rootCertPath(), false);
        return values;
    }
    @Override public void checkConfiguration(java.util.Map<String,String> values) {
        try {
            PaymentCredentialValidation.identity(values, "appId"); PaymentCredentialValidation.identity(values, "merchantId");
            if (!Set.of("https://openapi.alipay.com/gateway.do", "https://openapi-sandbox.dl.alipaydev.com/gateway.do").contains(values.get("serverUrl"))) throw new IllegalArgumentException("Invalid gateway");
            var privateKey = PaymentCredentialValidation.privateKey(values.get("privateKey"));
            if ("PUBLIC_KEY".equals(values.get("keyMode"))) PaymentCredentialValidation.publicKey(values.get("publicKey"));
            else if ("CERTIFICATE".equals(values.get("keyMode"))) {
                var app = PaymentCredentialValidation.certificate(values.get("appCertificate"));
                if (!(app.getPublicKey() instanceof java.security.interfaces.RSAPublicKey key) || !key.getModulus().equals(privateKey.getModulus())) throw new IllegalArgumentException("Application certificate/key mismatch");
                PaymentCredentialValidation.certificate(values.get("alipayCertificate"));
                PaymentCredentialValidation.rootCertificates(values.get("rootCertificate"));
            } else throw new IllegalArgumentException("Invalid key mode");
            buildManaged(values);
        } catch (Exception exception) { throw badRequest("PAYMENT_CREDENTIAL_INVALID", "支付宝凭证格式、配对或证书有效期检测未通过"); }
    }
    private AlipayClient buildManaged(java.util.Map<String,String> values) {
        try {
            AlipayConfig config = new AlipayConfig();
            config.setServerUrl(values.get("serverUrl")); config.setAppId(values.get("appId"));
            config.setPrivateKey(PaymentCredentialValidation.key(values.get("privateKey")));
            config.setFormat("json"); config.setCharset("UTF-8"); config.setSignType("RSA2");
            config.setConnectTimeout(5000); config.setReadTimeout(15000);
            if ("CERTIFICATE".equals(values.get("keyMode"))) {
                config.setAppCertContent(values.get("appCertificate")); config.setAlipayPublicCertContent(values.get("alipayCertificate")); config.setRootCertContent(values.get("rootCertificate"));
            } else config.setAlipayPublicKey(PaymentCredentialValidation.key(values.get("publicKey")));
            return new DefaultAlipayClient(config);
        } catch (Exception exception) { throw badRequest("PAYMENT_CREDENTIAL_INVALID", "支付宝凭证配置不可用，请联系管理员"); }
    }

    private AlipayClient buildAlipay(AlipayMerchant m) {
        try {
            String url = m.serverUrl() == null ? "https://openapi.alipay.com/gateway.do" : m.serverUrl();
            if (!Set.of("https://openapi.alipay.com/gateway.do", "https://openapi-sandbox.dl.alipaydev.com/gateway.do").contains(url)) {
                throw badRequest("PAYMENT_GATEWAY_INVALID", "支付宝网关必须为官方生产或沙箱地址");
            }
            AlipayConfig config = new AlipayConfig();
            config.setServerUrl(url); config.setAppId(m.appId()); config.setPrivateKey(read(m.privateKeyPath()));
            config.setFormat("json"); config.setCharset("UTF-8"); config.setSignType("RSA2");
            config.setConnectTimeout(5000); config.setReadTimeout(15000);
            if (m.appCertPath() != null || m.alipayCertPath() != null || m.rootCertPath() != null) {
                required(m.appCertPath()); required(m.alipayCertPath()); required(m.rootCertPath());
                config.setAppCertPath(m.appCertPath()); config.setAlipayPublicCertPath(m.alipayCertPath());
                config.setRootCertPath(m.rootCertPath());
            } else config.setAlipayPublicKey(read(m.publicKeyPath()));
            return new DefaultAlipayClient(config);
        } catch (Exception exception) {
            throw badRequest("PAYMENT_CREDENTIAL_INVALID", "支付宝密钥或证书配置不可用，请联系管理员");
        }
    }

    private static String read(String path) throws java.io.IOException {
        required(path);
        return Files.readString(Path.of(path)).replaceAll("-----[^\\r\\n]+-----", "").replaceAll("\\s", "");
    }
    private static void required(String value) {
        if (value == null || value.isBlank()) throw badRequest("PAYMENT_CREDENTIAL_INVALID", "支付商户必需配置缺失，请联系管理员");
    }
}
