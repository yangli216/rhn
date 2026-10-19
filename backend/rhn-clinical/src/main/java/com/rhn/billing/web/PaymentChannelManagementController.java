package com.rhn.billing.web;

import com.rhn.billing.application.PaymentChannelManagementService;
import com.rhn.billing.application.PaymentChannelManagementService.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/billing/payment-channel-management")
public class PaymentChannelManagementController {
    private final PaymentChannelManagementService service;
    public PaymentChannelManagementController(PaymentChannelManagementService service) { this.service = service; }
    @GetMapping PaymentConfigurationCatalog paymentConfigurationCatalog() { return service.catalog(); }
    @GetMapping("/organizations/{organizationId}/channels/{method}")
    PaymentMerchantConfigurationView paymentMerchantConfiguration(@PathVariable Long organizationId, @PathVariable String method) { return service.get(organizationId, method); }
    @PutMapping("/organizations/{organizationId}/channels/{method}")
    PaymentMerchantConfigurationView savePaymentMerchantConfiguration(@PathVariable Long organizationId, @PathVariable String method, @jakarta.validation.Valid @RequestBody PaymentMerchantConfigurationUpdate update) { return service.save(organizationId, method, update); }
    @PostMapping("/organizations/{organizationId}/channels/{method}/check")
    PaymentConfigurationCheckResult checkPaymentMerchantConfiguration(@PathVariable Long organizationId, @PathVariable String method, @jakarta.validation.Valid @RequestBody PaymentMerchantConfigurationUpdate update) { return service.check(organizationId, method, update); }
}
