package com.rhn.coordination.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class OutpatientCancellationViews {
    private OutpatientCancellationViews() {
    }

    public record CancelEncounterRequest(
            @NotBlank @Size(max = 80) String commandCode,
            @NotBlank @Size(max = 500) String reason,
            @Size(max = 64) String terminalCode) {
    }

    public record CancelEncounterResponse(
            Long encounterId,
            String encounterStatus,
            String registrationStatus,
            String queueStatus,
            String appointmentStatus,
            String billingStatus,
            Long refundOrderId,
            String refundStatus,
            boolean completed,
            String message) {
    }
}
