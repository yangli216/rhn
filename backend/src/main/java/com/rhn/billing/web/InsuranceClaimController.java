package com.rhn.billing.web;

import com.rhn.billing.api.InsuranceResultDirectory.InsuranceSettlementView;
import com.rhn.billing.application.InsuranceClaimApplicationService;
import com.rhn.billing.application.InsuranceClaimApplicationService.LineMapping;
import com.rhn.billing.application.InsuranceClaimApplicationService.PreSettleCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/billing")
public class InsuranceClaimController {
    private final InsuranceClaimApplicationService service;
    public InsuranceClaimController(InsuranceClaimApplicationService service) { this.service = service; }

    @PostMapping("/settlements/{settlementId}/insurance/pre-settlements")
    @ResponseStatus(HttpStatus.CREATED)
    InsuranceSettlementView preSettle(@PathVariable Long settlementId, @Valid @RequestBody PreSettleRequest input) {
        return service.preSettle(new PreSettleCommand(settlementId, input.coverageId(), input.idempotencyKey(),
                input.regionCode(), input.insuranceTypeCode(), input.organizationCode(), input.departmentCode(),
                input.practitionerCode(), input.diagnosisPayloadDigest(), input.serviceStartedAt(),
                input.serviceEndedAt(), input.correlationId(), input.lines().stream().map(line -> new LineMapping(
                        line.settlementLineId(), line.insuranceItemCode(), line.traceAttributes())).toList()));
    }

    @GetMapping("/insurance-claims/{claimId}")
    InsuranceSettlementView get(@PathVariable Long claimId) { return service.get(claimId); }

    @PostMapping("/insurance-claims/{claimId}/settle")
    InsuranceSettlementView settle(@PathVariable Long claimId, @Valid @RequestBody OperationRequest input) {
        return service.settle(claimId, input.commandCode());
    }

    @PostMapping("/insurance-claims/{claimId}/query")
    InsuranceSettlementView query(@PathVariable Long claimId, @Valid @RequestBody OperationRequest input) {
        return service.query(claimId, input.commandCode());
    }

    @PostMapping("/insurance-claims/{claimId}/reverse")
    InsuranceSettlementView reverse(@PathVariable Long claimId, @Valid @RequestBody ReversalRequest input) {
        return service.reverse(claimId, input.commandCode(), input.reason());
    }

    @GetMapping("/insurance-claims/recovery-worklist")
    List<InsuranceSettlementView> recoveryWorklist(@RequestParam(defaultValue = "50") int limit) {
        return service.recoveryWorklist(limit);
    }

    @PostMapping("/insurance-claims/recovery")
    List<InsuranceClaimApplicationService.RecoveryResult> recover(@Valid @RequestBody RecoveryRequest input) {
        return service.recoverPending(input.batchCode(), input.limit() == null ? 50 : input.limit());
    }

    record PreSettleRequest(
            @NotNull Long coverageId, @NotBlank @Size(max = 128) String idempotencyKey,
            @NotBlank @Size(max = 64) String regionCode,
            @NotBlank @Size(max = 64) String insuranceTypeCode,
            @NotBlank @Size(max = 128) String organizationCode,
            @NotBlank @Size(max = 128) String departmentCode,
            @NotBlank @Size(max = 128) String practitionerCode,
            @NotBlank @Size(max = 128) String diagnosisPayloadDigest,
            Instant serviceStartedAt, Instant serviceEndedAt,
            @Size(max = 128) String correlationId,
            @NotEmpty @Size(max = 500) List<@Valid LineMappingRequest> lines) {}
    record LineMappingRequest(@NotNull Long settlementLineId,
                              @NotBlank @Size(max = 128) String insuranceItemCode,
                              @Size(max = 50) Map<@Size(max = 64) String, @Size(max = 256) String> traceAttributes) {}
    record OperationRequest(@NotBlank @Size(max = 128) String commandCode) {}
    record ReversalRequest(@NotBlank @Size(max = 128) String commandCode,
                           @NotBlank @Size(max = 500) String reason) {}
    record RecoveryRequest(@NotBlank @Size(max = 96) String batchCode,
                           @jakarta.validation.constraints.Min(1)
                           @jakarta.validation.constraints.Max(100) Integer limit) {}
}
