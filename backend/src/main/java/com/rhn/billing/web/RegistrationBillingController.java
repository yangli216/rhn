package com.rhn.billing.web;

import com.rhn.billing.api.RegistrationBillingViews.RegistrationIntentView;
import com.rhn.billing.application.RegistrationBillingService;
import com.rhn.billing.application.RegistrationBillingService.CreateRegistrationIntentCommand;
import jakarta.validation.Valid;
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

@RestController
@RequestMapping("/api/billing/registration-intents")
public class RegistrationBillingController {
    private final RegistrationBillingService service;

    public RegistrationBillingController(RegistrationBillingService service) { this.service = service; }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    RegistrationIntentView create(@Valid @RequestBody CreateRegistrationIntentRequest input) {
        return service.create(new CreateRegistrationIntentCommand(input.residentId(), input.organizationId(),
                input.departmentId(), input.appointmentId(), input.scheduleId(), input.idempotencyCode(), input.registrationSource(),
                input.visitType(), input.settlementMode(), input.coverageId()));
    }

    @GetMapping("/{intentId}")
    RegistrationIntentView get(@PathVariable Long intentId) { return service.get(intentId); }

    @PostMapping("/{intentId}/completion/retry")
    RegistrationIntentView retry(@PathVariable Long intentId) { return service.retry(intentId); }

    @PostMapping("/{intentId}/cancel")
    RegistrationIntentView cancel(@PathVariable Long intentId) { return service.cancel(intentId); }

    record CreateRegistrationIntentRequest(
            @NotNull Long residentId, @NotNull Long organizationId, @NotNull Long departmentId,
            Long appointmentId, Long scheduleId, @NotNull @Size(max = 128) String idempotencyCode,
            @Pattern(regexp = "WINDOW|WALK_IN|DIRECT|EMERGENCY") String registrationSource,
            @Pattern(regexp = "GENERAL|FOLLOW_UP|EMERGENCY") String visitType,
            @Pattern(regexp = "SELF_PAY|MEDICAL_INSURANCE") String settlementMode,
            Long coverageId) {}
}
