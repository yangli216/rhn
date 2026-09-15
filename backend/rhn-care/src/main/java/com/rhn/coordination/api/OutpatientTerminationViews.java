package com.rhn.coordination.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

public final class OutpatientTerminationViews {
    private OutpatientTerminationViews() {}

    public record TerminationIssueView(String code, String message, String routePath) {}

    public record TerminationReadinessView(Long encounterId, String clinicalStatus, boolean ready,
                                           List<TerminationIssueView> issues, Instant checkedAt) {}

    public record TerminateEncounterRequest(
            @NotBlank @Size(max = 128) String commandCode,
            @NotBlank @Pattern(regexp = "PATIENT_LEFT|PATIENT_REQUEST|TRANSFERRED|OTHER") String terminationCode,
            @NotBlank @Size(max = 500) String reason) {}

    public record TerminationResultView(Long encounterId, String clinicalStatus, String terminationCode,
                                        String terminationReason, Instant terminatedAt, String message) {}
}
