package com.rhn.billing.infrastructure.fiscal;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

/**
 * 财政电子票据 HTTP 网关接入配置。地址与凭据由财政平台开通接入时下发，不提供默认值；
 * 启用时缺失必填项，应用启动即失败，避免带着未核实的资料联调。
 */
@ConfigurationProperties(prefix = "rhn.billing.fiscal.gateway", ignoreUnknownFields = false)
public record FiscalGatewayProperties(
        @DefaultValue("false") boolean enabled,
        /** 网关基址，其下为 /v1/receipts/{issue|query|void|redFlush} */
        String baseUrl,
        String clientId,
        String clientSecret,
        @DefaultValue("3s") Duration connectTimeout,
        @DefaultValue("20s") Duration readTimeout,
        Callback callback) {

    /**
     * 异步结果回调入口。回调请求没有登录态也不带租户信息，因此必须由配置固定其落入的租户与机构。
     * 密钥只用于校验 HMAC-SHA256 签名。
     */
    public record Callback(
            @DefaultValue("false") boolean enabled,
            @DefaultValue("/integration/fiscal/callback") String path,
            String secret,
            Long tenantId,
            Long organizationId,
            /** 外部消息按机构与科室范围留痕，回调必须落入一个明确的科室 */
            Long departmentId,
            @DefaultValue("5m") Duration maxClockSkew) {
        @Override public String toString() {
            return "Callback[enabled=" + enabled + ", path=" + path + ", secret=REDACTED]";
        }
    }

    public FiscalGatewayProperties {
        callback = callback == null ? new Callback(false, "/integration/fiscal/callback", null, null, null, null, Duration.ofMinutes(5)) : callback;
        if (enabled) {
            require(baseUrl, "base-url"); require(clientId, "client-id"); require(clientSecret, "client-secret");
        }
        if (callback.enabled()) {
            if (!enabled) throw new IllegalStateException("rhn.billing.fiscal.gateway.callback 需要同时启用 gateway.enabled");
            require(callback.secret(), "callback.secret");
            if (callback.tenantId() == null || callback.organizationId() == null || callback.departmentId() == null) {
                throw new IllegalStateException("rhn.billing.fiscal.gateway.callback.tenant-id / organization-id / department-id 未配置，回调无法确定落入的租户、机构与科室");
            }
            if (callback.path() == null || !callback.path().startsWith("/") || callback.path().startsWith("/api/") || callback.path().contains("*")) {
                throw new IllegalStateException("rhn.billing.fiscal.gateway.callback.path 必须是不在 /api/ 下的精确路径");
            }
        }
    }

    @Override public String toString() {
        return "FiscalGatewayProperties[enabled=" + enabled + ", baseUrl=" + baseUrl + ", credentials=REDACTED]";
    }

    private static void require(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("rhn.billing.fiscal.gateway." + name + " 未配置，不能启用财政电子票据网关");
        }
    }
}
