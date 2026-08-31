package com.rhn.treatment.web;

import com.rhn.treatment.api.SkinTestWorkItemView;
import com.rhn.treatment.application.SkinTestApplicationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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
import java.util.List;

@RestController
@RequestMapping("/api/treatments/skin-tests")
@PreAuthorize(com.rhn.treatment.api.TreatmentPermissions.ACCESS)
public class SkinTestController {
    private final SkinTestApplicationService service;

    public SkinTestController(SkinTestApplicationService service) { this.service = service; }

    @GetMapping("/worklist")
    List<SkinTestWorkItemView> worklist(@RequestParam(required = false) String status,
                                        @RequestParam(required = false) String keyword,
                                        @RequestParam(required = false) Long encounterId) {
        return service.worklist(status, keyword, encounterId);
    }

    @PostMapping("/medication-requests/{medicationRequestId}/start")
    @ResponseStatus(HttpStatus.CREATED)
    SkinTestWorkItemView start(@PathVariable Long medicationRequestId,
                               @Valid @RequestBody StartSkinTestRequest input) {
        return service.start(medicationRequestId, input.expectedMedicationRevision(),
                Boolean.TRUE.equals(input.identityVerified()), input.verificationMethod(), input.testMethod(),
                Boolean.TRUE.equals(input.originalSolution()), input.solutionCatalogItemId(), input.solutionName(),
                input.stockLotId(), input.lotNo(), input.concentration(), input.concentrationUnit(),
                input.bodySite(), input.observationMinutes());
    }

    @PostMapping("/events/{eventId}/complete")
    SkinTestWorkItemView complete(@PathVariable Long eventId,
                                  @Valid @RequestBody CompleteSkinTestRequest input) {
        return service.complete(eventId, input.expectedRevision(), input.result(), input.whealDiameterMm(),
                input.flareDiameterMm(), input.reactionDescription(), input.earlyReadReason());
    }

    @PostMapping("/events/{eventId}/cancel")
    SkinTestWorkItemView cancel(@PathVariable Long eventId,
                                @Valid @RequestBody CancelSkinTestRequest input) {
        return service.cancel(eventId, input.expectedRevision(), input.reason());
    }

    record StartSkinTestRequest(
            @NotNull Long expectedMedicationRevision,
            @NotNull Boolean identityVerified,
            @Pattern(regexp = "NAME_AND_IDENTIFIER|CARD|MANUAL") String verificationMethod,
            @NotNull @Pattern(regexp = "INTRADERMAL|PRICK|OTHER") String testMethod,
            @NotNull Boolean originalSolution,
            Long solutionCatalogItemId,
            @Size(max = 300) String solutionName,
            Long stockLotId,
            @Size(max = 128) String lotNo,
            @DecimalMin(value = "0", inclusive = false) BigDecimal concentration,
            @Size(max = 64) String concentrationUnit,
            @Size(max = 128) String bodySite,
            @Min(1) @Max(120) int observationMinutes) {}

    record CompleteSkinTestRequest(
            @NotNull Long expectedRevision,
            @NotNull @Pattern(regexp = "NEGATIVE|POSITIVE|UNCERTAIN|INVALID") String result,
            @DecimalMin("0") BigDecimal whealDiameterMm,
            @DecimalMin("0") BigDecimal flareDiameterMm,
            @Size(max = 1000) String reactionDescription,
            @Size(max = 1000) String earlyReadReason) {}

    record CancelSkinTestRequest(@NotNull Long expectedRevision,
                                 @NotNull @Size(min = 1, max = 1000) String reason) {}
}
