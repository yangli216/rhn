package com.rhn.billing.infrastructure.payment;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import static com.rhn.shared.api.BusinessErrors.badRequest;

/** Shared institution identity semantics; each provider owns its own credential type. */
final class PaymentMerchantSelection {
    interface ScopedMerchant { Long tenantId(); Long organizationId(); }
    private PaymentMerchantSelection() {}
    static boolean configured(List<? extends ScopedMerchant> merchants, Long tenantId, Long organizationId) {
        return tenantId != null && organizationId != null && merchants.stream()
                .filter(m -> Objects.equals(tenantId, m.tenantId()) && Objects.equals(organizationId, m.organizationId())).count() == 1;
    }
    static <T extends ScopedMerchant> T require(List<T> merchants, Long tenantId, Long organizationId) {
        if (!configured(merchants, tenantId, organizationId)) throw badRequest("PAYMENT_MERCHANT_NOT_CONFIGURED", "支付单所属机构未配置唯一的渠道商户");
        return merchants.stream().filter(m -> Objects.equals(tenantId, m.tenantId())
                && Objects.equals(organizationId, m.organizationId())).findFirst().orElseThrow();
    }
    static void validateScopes(List<? extends ScopedMerchant> merchants) {
        var scopes = new HashSet<String>();
        for (var merchant : merchants) {
            if (merchant == null || merchant.tenantId() == null || merchant.organizationId() == null
                    || merchant.tenantId() <= 0 || merchant.organizationId() <= 0
                    || !scopes.add(merchant.tenantId() + "/" + merchant.organizationId())) {
                throw new IllegalArgumentException("渠道商户的租户、机构标识缺失或重复");
            }
        }
    }
}
