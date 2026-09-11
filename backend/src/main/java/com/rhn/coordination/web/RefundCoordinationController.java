package com.rhn.coordination.web;

import com.rhn.billing.api.PaymentResultDirectory.PaymentOrderView;
import com.rhn.billing.api.RefundPreCheckViews.DirectRefundCommand;
import com.rhn.billing.api.RefundPreCheckViews.RefundPreCheckSummaryView;
import com.rhn.coordination.api.RefundCoordinationDirectory;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/billing")
public class RefundCoordinationController {
    private final RefundCoordinationDirectory refunds;

    public RefundCoordinationController(RefundCoordinationDirectory refunds) {
        this.refunds = refunds;
    }

    @GetMapping("/encounters/{encounterId}/refund-precheck")
    public RefundPreCheckSummaryView getRefundPreCheck(@PathVariable Long encounterId) {
        return refunds.preCheck(encounterId);
    }

    @PostMapping("/payments/{paymentId}/direct-refund")
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentOrderView directRefund(@PathVariable Long paymentId,
                                         @Valid @RequestBody DirectRefundRequest input) {
        return refunds.directRefund(paymentId, new DirectRefundCommand(
                input.idempotencyKey(), input.refundAmount(), input.reason(),
                input.terminalCode(), input.chargeItemIds()));
    }

    record DirectRefundRequest(
            @NotBlank @Size(max = 128) String idempotencyKey,
            @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 18, fraction = 6)
            BigDecimal refundAmount,
            @NotBlank @Size(max = 1000) String reason,
            @Size(max = 128) String correlationId,
            @Size(max = 128) String terminalCode,
            List<Long> chargeItemIds) {}
}
