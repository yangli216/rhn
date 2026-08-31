package com.rhn.inpatient.web;

import com.rhn.inpatient.api.InpatientBillingViews.AccountView;
import com.rhn.inpatient.api.InpatientBillingViews.BedDayPostingView;
import com.rhn.inpatient.api.InpatientBillingViews.DailyStatementView;
import com.rhn.inpatient.api.InpatientBillingViews.DepositView;
import com.rhn.inpatient.api.InpatientBillingViews.FinalSettlementView;
import com.rhn.inpatient.api.InpatientBillingViews.FinancialActionView;
import com.rhn.inpatient.api.InpatientPermissions;
import com.rhn.inpatient.application.InpatientBillingService;
import com.rhn.inpatient.application.InpatientBillingService.DepositCommand;
import com.rhn.inpatient.application.InpatientBillingService.BedDayPostingCommand;
import com.rhn.inpatient.application.InpatientBillingService.FinalSettlementCommand;
import com.rhn.inpatient.application.InpatientBillingService.SettlementPaymentCommand;
import com.rhn.inpatient.application.InpatientBillingService.SurplusRefundCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@RestController
@RequestMapping("/api/inpatient/episodes/{episodeId}/billing")
@PreAuthorize(InpatientPermissions.ACCESS)
public class InpatientBillingController {
    private final InpatientBillingService service;

    public InpatientBillingController(InpatientBillingService service) {
        this.service = service;
    }

    @GetMapping
    AccountView account(@PathVariable Long episodeId,
                        @RequestParam(defaultValue = "CNY") String currencyCode) {
        return service.account(episodeId, currencyCode);
    }

    @PostMapping("/deposits")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN') or "
            + "(hasAuthority('INPATIENT.ACCESS') and hasAuthority('BILLING.ACCESS'))")
    DepositView deposit(@PathVariable Long episodeId, @Valid @RequestBody DepositRequest input) {
        return service.registerDeposit(episodeId, new DepositCommand(
                input.paymentNo(), input.amount(), input.currencyCode(), input.paymentMethodCode(),
                input.paidAt(), input.externalTransactionNo(), input.description()));
    }

    @PostMapping("/bed-days/post")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN') or "
            + "(hasAuthority('INPATIENT.ACCESS') and hasAuthority('BILLING.ACCESS'))")
    BedDayPostingView postBedDays(@PathVariable Long episodeId,
                                  @Valid @RequestBody BedDayPostingRequest input) {
        return service.postBedDays(episodeId,
                new BedDayPostingCommand(input.throughDate(), input.currencyCode(), input.commandCode()));
    }

    @GetMapping("/daily-statement")
    DailyStatementView dailyStatement(@PathVariable Long episodeId,
                                      @RequestParam(required = false) LocalDate businessDate,
                                      @RequestParam(defaultValue = "CNY") String currencyCode) {
        return service.dailyStatement(episodeId, businessDate, currencyCode);
    }

    @PostMapping("/final-settlement")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN') or "
            + "(hasAuthority('INPATIENT.ACCESS') and hasAuthority('BILLING.ACCESS'))")
    FinalSettlementView finalSettlement(@PathVariable Long episodeId,
                                        @Valid @RequestBody FinalSettlementRequest input) {
        return service.finalSettlement(episodeId, new FinalSettlementCommand(
                input.invoiceNo(), input.currencyCode(), input.issuedAt(), input.terminalCode(),
                input.commandCode()));
    }

    @PostMapping("/final-settlement/payments")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN') or "
            + "(hasAuthority('INPATIENT.ACCESS') and hasAuthority('BILLING.ACCESS'))")
    FinancialActionView collectFinalPayment(@PathVariable Long episodeId,
                                            @Valid @RequestBody SettlementPaymentRequest input) {
        return service.collectFinalPayment(episodeId, new SettlementPaymentCommand(
                input.expectedRevision(), input.commandCode(), input.paymentMethodCode(), input.amount(),
                input.currencyCode(), input.paidAt(), input.externalTransactionNo(), input.description()));
    }

    @PostMapping("/final-settlement/refunds")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN') or "
            + "(hasAuthority('INPATIENT.ACCESS') and hasAuthority('BILLING.ACCESS'))")
    FinancialActionView refundSurplus(@PathVariable Long episodeId,
                                      @Valid @RequestBody SurplusRefundRequest input) {
        return service.refundSurplus(episodeId, new SurplusRefundCommand(
                input.expectedRevision(), input.commandCode(), input.amount(), input.currencyCode(),
                input.refundedAt(), input.externalTransactionNo(), input.reason()));
    }

    record DepositRequest(
            @NotBlank @Size(max = 64) String paymentNo,
            @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 18, fraction = 6)
            BigDecimal amount,
            @Pattern(regexp = "[A-Za-z]{3}") String currencyCode,
            @NotBlank @Size(max = 64) String paymentMethodCode,
            Instant paidAt,
            @Size(max = 128) String externalTransactionNo,
            @Size(max = 1000) String description) {
    }

    record BedDayPostingRequest(
            @NotNull LocalDate throughDate,
            @Pattern(regexp = "[A-Za-z]{3}") String currencyCode,
            @NotBlank @Size(max = 100) String commandCode) {
    }

    record FinalSettlementRequest(
            @NotBlank @Size(max = 64) String invoiceNo,
            @Pattern(regexp = "[A-Za-z]{3}") String currencyCode,
            Instant issuedAt,
            @Size(max = 128) String terminalCode,
            @NotBlank @Size(max = 100) String commandCode) {
    }

    record SettlementPaymentRequest(
            @NotNull Long expectedRevision,
            @NotBlank @Size(max = 64) String commandCode,
            @NotBlank @Size(max = 128) String paymentMethodCode,
            @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 18, fraction = 6)
            BigDecimal amount,
            @Pattern(regexp = "[A-Za-z]{3}") String currencyCode,
            Instant paidAt,
            @Size(max = 128) String externalTransactionNo,
            @Size(max = 1000) String description) {
    }

    record SurplusRefundRequest(
            @NotNull Long expectedRevision,
            @NotBlank @Size(max = 48) String commandCode,
            @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 18, fraction = 6)
            BigDecimal amount,
            @Pattern(regexp = "[A-Za-z]{3}") String currencyCode,
            Instant refundedAt,
            @Size(max = 128) String externalTransactionNo,
            @NotBlank @Size(max = 1000) String reason) {
    }
}
