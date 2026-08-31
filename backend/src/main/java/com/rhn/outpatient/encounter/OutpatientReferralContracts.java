package com.rhn.outpatient.encounter;

import jakarta.validation.constraints.FutureOrPresent;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public final class OutpatientReferralContracts {
    private OutpatientReferralContracts() {}

    public record CreateRequest(
            @Pattern(regexp = "INTERNAL_CONSULT|DEPARTMENT_TRANSFER") String referralType,
            @NotNull Long targetOrganizationId,
            @NotNull Long targetDepartmentId,
            Long targetPractitionerId,
            @Pattern(regexp = "ROUTINE|URGENT") String urgency,
            @NotBlank @Size(max = 2000) String referralReason,
            @NotBlank @Size(max = 4000) String clinicalSummary,
            @FutureOrPresent Instant expectedAt,
            @NotBlank @Size(max = 128) String commandCode
    ) {}

    public record AcceptRequest(@NotBlank @Size(max = 128) String commandCode) {}

    public record CompleteRequest(
            @NotBlank @Size(max = 128) String commandCode,
            @NotBlank @Size(max = 4000) String opinion
    ) {}

    public record RejectRequest(
            @NotBlank @Size(max = 128) String commandCode,
            @NotBlank @Size(max = 1000) String reason
    ) {}

    public record CancelRequest(
            @NotBlank @Size(max = 128) String commandCode,
            @NotBlank @Size(max = 1000) String reason
    ) {}

    public record View(
            Long id,
            long revision,
            String requestNo,
            Long encounterId,
            String encounterNo,
            String sourceEncounterStatus,
            Long residentId,
            String residentName,
            String healthRecordNo,
            Long sourceOrganizationId,
            String sourceOrganizationName,
            Long sourceDepartmentId,
            String sourceDepartmentName,
            String referralType,
            Long targetOrganizationId,
            String targetOrganizationName,
            Long targetDepartmentId,
            String targetDepartmentName,
            Long targetPractitionerId,
            String urgency,
            String referralReason,
            String clinicalSummary,
            Instant expectedAt,
            String status,
            Long targetRegistrationId,
            Long targetEncounterId,
            Long requestedBy,
            Instant requestedAt,
            Long acceptedBy,
            Instant acceptedAt,
            Long completedBy,
            Instant completedAt,
            String outcomeText,
            String rejectionReason
    ) {}
}
