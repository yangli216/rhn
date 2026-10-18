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

class AlipayPaymentClients {
    private final AlipayPaymentProperties properties;
    private final ConcurrentMap<AlipayMerchant, AlipayClient> clients = new ConcurrentHashMap<>();
    AlipayPaymentClients(AlipayPaymentProperties properties) {
        this.properties = properties;
        com.alipay.api.internal.util.AlipayLogger.setNeedEnableLogger(false);
        com.alipay.api.internal.util.AlipayLogger.setJDKDebugEnabled(false);
    }
    boolean configured(Long tenantId, Long organizationId) { return PaymentMerchantSelection.configured(properties.merchants(), tenantId, organizationId); }
    AlipayMerchant merchant(Long tenantId, Long organizationId) {
        var merchant = PaymentMerchantSelection.require(properties.merchants(), tenantId, organizationId);
        required(merchant.appId()); required(merchant.merchantId()); return merchant;
    }
    AlipayClient client(AlipayMerchant merchant) { return clients.computeIfAbsent(merchant, this::buildAlipay); }

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
