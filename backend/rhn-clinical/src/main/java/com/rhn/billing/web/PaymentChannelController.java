package com.rhn.billing.web;

import com.rhn.billing.api.PaymentChannelCapabilityView;
import com.rhn.billing.application.PaymentChannelRegistry;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/billing/payment-methods")
public class PaymentChannelController {
    private final PaymentChannelRegistry channels;
    private final ExecutionContextProvider contexts;
    public PaymentChannelController(PaymentChannelRegistry channels, ExecutionContextProvider contexts) {
        this.channels = channels; this.contexts = contexts;
    }
    @GetMapping("/{paymentMethodCode}/capabilities")
    PaymentChannelCapabilityView paymentChannelCapabilities(@PathVariable String paymentMethodCode) {
        var context = contexts.requireCurrent();
        return channels.describe(paymentMethodCode, context.tenantId(), context.organizationId());
    }
}
