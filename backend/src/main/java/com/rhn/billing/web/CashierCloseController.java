package com.rhn.billing.web;

import com.rhn.billing.application.CashierCloseApplicationService;
import com.rhn.billing.application.CashierCloseApplicationService.ActualAmount;
import com.rhn.billing.application.CashierCloseApplicationService.CalculateCommand;
import com.rhn.billing.application.CashierCloseApplicationService.CashierCloseView;
import com.rhn.billing.application.CashierCloseApplicationService.ConfirmCommand;
import com.rhn.billing.application.CashierCloseApplicationService.ReverseCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
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
import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/billing/cashier-closes")
public class CashierCloseController {
    private final CashierCloseApplicationService service;
    public CashierCloseController(CashierCloseApplicationService service) { this.service = service; }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    CashierCloseView calculate(@Valid @RequestBody CalculateRequest input) {
        return service.calculate(new CalculateCommand(input.commandCode(), input.terminalCode(), input.rangeFrom(),
                input.rangeTo(), input.actualAmounts() == null ? List.of() : input.actualAmounts().stream()
                .map(value -> new ActualAmount(value.paymentMethodCode(), value.paymentType(), value.amount())).toList()));
    }
    @PostMapping("/{closeId}/confirm")
    CashierCloseView confirm(@PathVariable Long closeId, @Valid @RequestBody ConfirmRequest input) {
        return service.confirm(closeId, new ConfirmCommand(input.commandCode(), input.differenceReason()));
    }
    @PostMapping("/{closeId}/reverse")
    @ResponseStatus(HttpStatus.CREATED)
    CashierCloseView reverse(@PathVariable Long closeId, @Valid @RequestBody ReverseRequest input) {
        return service.reverse(closeId, new ReverseCommand(input.commandCode(), input.reason()));
    }
    @GetMapping("/{closeId}") CashierCloseView get(@PathVariable Long closeId) { return service.get(closeId); }
    @GetMapping List<CashierCloseView> listMine() { return service.listMine(); }

    record CalculateRequest(@NotBlank @Size(max = 128) String commandCode,
                            @NotBlank @Size(max = 128) String terminalCode,
                            @NotNull Instant rangeFrom, @NotNull Instant rangeTo,
                            List<@Valid ActualAmountRequest> actualAmounts) {}
    record ActualAmountRequest(@NotBlank @Size(max = 128) String paymentMethodCode,
                               @NotBlank @Pattern(regexp = "PAYMENT|REFUND") String paymentType,
                               @NotNull @Digits(integer = 18, fraction = 6) BigDecimal amount) {}
    record ConfirmRequest(@NotBlank @Size(max = 128) String commandCode,
                          @Size(max = 1000) String differenceReason) {}
    record ReverseRequest(@NotBlank @Size(max = 128) String commandCode,
                          @NotBlank @Size(max = 1000) String reason) {}
}
