package com.rhn.billing.application;

import com.rhn.billing.api.PaymentChannelAdapter;
import com.rhn.billing.api.PaymentChannelCapabilities;
import com.rhn.billing.api.PaymentChannelCapabilityView;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;

/** A payment method has one stable owner. Adding a bean cannot silently reroute existing orders. */
@Service
public class PaymentChannelRegistry {
    private final Map<String, PaymentChannelAdapter> routes;
    private final boolean externalHandoffEnabled;

    public PaymentChannelRegistry(List<PaymentChannelAdapter> adapters,
            @Value("${rhn.billing.payment.routing.external-handoff-enabled:false}") boolean externalHandoffEnabled) {
        Map<String, PaymentChannelAdapter> registered = new LinkedHashMap<>();
        Map<String, PaymentChannelAdapter> owners = new LinkedHashMap<>();
        for (PaymentChannelAdapter adapter : adapters) {
            if (adapter.paymentMethods() == null || adapter.paymentMethods().isEmpty()) throw conflict("PAYMENT_CHANNEL_DECLARATION_INVALID", "支付适配器必须声明支付方式");
            for (String method : adapter.paymentMethods()) {
                if (!normalize(method).equals(method)) throw conflict("PAYMENT_CHANNEL_DECLARATION_INVALID", "适配器支付方式须使用规范编码");
                PaymentChannelCapabilities capability = adapter.capabilities(method);
                if (capability == null) throw conflict("PAYMENT_CHANNEL_DECLARATION_INVALID", "支付适配器缺少能力声明");
                PaymentChannelAdapter previous = registered.putIfAbsent(method, adapter);
                if (previous != null) throw conflict("PAYMENT_CHANNEL_ROUTE_AMBIGUOUS", "支付方式存在多个适配器：" + method);
                previous = owners.putIfAbsent(capability.adapterCode(), adapter);
                if (previous != null && previous != adapter) throw conflict("PAYMENT_CHANNEL_ID_DUPLICATED", "支付适配器编码重复：" + capability.adapterCode());
            }
        }
        this.routes = Map.copyOf(registered);
        this.externalHandoffEnabled = externalHandoffEnabled;
    }

    public PaymentChannelAdapter resolve(String paymentMethodCode) {
        PaymentChannelAdapter adapter = routes.get(normalize(paymentMethodCode));
        if (adapter == null && !externalHandoffEnabled) throw badRequest("PAYMENT_CHANNEL_NOT_CONFIGURED", "支付方式未配置渠道适配器");
        // Null is reserved for the explicitly enabled, independently deployed message adapter boundary.
        return adapter;
    }

    public PaymentChannelCapabilityView describe(String paymentMethodCode, Long tenantId, Long organizationId) {
        String method = normalize(paymentMethodCode);
        PaymentChannelAdapter adapter = routes.get(method);
        if (adapter == null) return new PaymentChannelCapabilityView(method, false, null, "支付方式未配置可交互的渠道适配器");
        boolean available = adapter.configured(tenantId, organizationId);
        return new PaymentChannelCapabilityView(method, available, adapter.capabilities(method),
                available ? null : "当前机构的渠道未启用或商户配置不可用，请联系管理员");
    }

    private static String normalize(String value) {
        if (value == null || value.isBlank() || value.length() > 128) throw badRequest("PAYMENT_METHOD_INVALID", "支付方式编码无效");
        return value.trim().toUpperCase(Locale.ROOT);
    }
}
