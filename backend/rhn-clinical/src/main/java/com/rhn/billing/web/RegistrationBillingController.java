package com.rhn.billing.web;

import com.rhn.billing.api.RegistrationBillingViews.RegistrationIntentView;
import com.rhn.billing.application.RegistrationBillingService;
import com.rhn.billing.application.RegistrationBillingService.CreateRegistrationIntentCommand;
import com.rhn.outpatient.api.OutpatientPermissions;
import jakarta.validation.Valid;
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

@RestController
@RequestMapping("/api/billing/registration-intents")
@PreAuthorize(OutpatientPermissions.REGISTRATION_BILLING_ACCESS)
public class RegistrationBillingController {
    private final RegistrationBillingService service;
    private final com.rhn.billing.application.RegistrationCancellationBillingService cancellation;

    public RegistrationBillingController(RegistrationBillingService service,
                                         com.rhn.billing.application.RegistrationCancellationBillingService cancellation) {
        this.service = service; this.cancellation = cancellation;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    RegistrationIntentView create(@Valid @RequestBody CreateRegistrationIntentRequest input) {
        return service.create(new CreateRegistrationIntentCommand(input.residentId(), input.organizationId(),
                input.departmentId(), input.appointmentId(), input.scheduleId(), input.idempotencyCode(), input.registrationSource(),
                input.visitType(), input.settlementMode(), input.coverageId()));
    }

    @GetMapping("/insurance-timing")
    InsuranceTimingView insuranceTiming(@RequestParam Long organizationId, @RequestParam Long departmentId) {
        return new InsuranceTimingView(service.insuranceTiming(organizationId, departmentId));
    }

    record InsuranceTimingView(String timing) {}

    /** 挂号流水按就诊批量查询费用类别（自费 / 医保），返回 {就诊ID: 结算方式}。 */
    @GetMapping("/settlement-modes")
    java.util.Map<Long, String> settlementModes(@RequestParam java.util.List<Long> encounterIds) {
        return service.settlementModesByEncounter(encounterIds.stream().limit(200).toList());
    }

    @GetMapping("/{intentId}")
    RegistrationIntentView get(@PathVariable Long intentId) { return service.get(intentId); }

    @PostMapping("/{intentId}/completion/retry")
    RegistrationIntentView retry(@PathVariable Long intentId) { return service.retry(intentId); }

    @PostMapping("/{intentId}/cancel")
    RegistrationIntentView cancel(@PathVariable Long intentId) { return cancellation.cancelIntent(intentId); }

    record CreateRegistrationIntentRequest(
            @NotNull Long residentId, @NotNull Long organizationId, @NotNull Long departmentId,
            Long appointmentId, Long scheduleId, @NotNull @Size(max = 128) String idempotencyCode,
            @Size(max = 32) String registrationSource,
            @Size(max = 32) String visitType,
            @Pattern(regexp = "SELF_PAY|MEDICAL_INSURANCE") String settlementMode,
            Long coverageId) {}
}
