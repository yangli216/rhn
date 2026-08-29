package com.rhn.billing.web;

import com.rhn.platform.integration.api.ExternalMessageService;
import com.rhn.platform.integration.api.ExternalMessageService.ExternalMessageReceipt;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Durable hand-off for independently deployed payment adapters. Inbound results deliberately do not
 * accept raw public callbacks here: an adapter must authenticate and verify the channel protocol first,
 * then invoke PaymentResultDirectory with a normalized verified result.
 */
@RestController
@RequestMapping("/api/integration/payments")
public class PaymentIntegrationController {
    private final ExternalMessageService messages;

    public PaymentIntegrationController(ExternalMessageService messages) {
        this.messages = messages;
    }

    @GetMapping("/outbound-messages")
    List<ExternalMessageReceipt> outbound(@RequestParam String endpointCode,
                                          @RequestParam(required = false) String status) {
        return messages.listOutbound(endpointCode, status);
    }

    @PostMapping("/outbound-messages/{messageId}/delivery")
    ExternalMessageReceipt delivery(@PathVariable Long messageId, @Valid @RequestBody DeliveryRequest input) {
        return messages.markDelivery(messageId, input.delivered(), input.errorCode(), input.errorMessage());
    }

    record DeliveryRequest(boolean delivered, @Size(max = 64) String errorCode,
                           @Size(max = 1000) String errorMessage) {}
}
