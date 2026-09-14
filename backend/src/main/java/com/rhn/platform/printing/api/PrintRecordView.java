package com.rhn.platform.printing.api;

import java.time.Instant;
import java.util.List;

public record PrintRecordView(
        Long outputId,
        String sourceType,
        Long sourceId,
        long sourceVersion,
        String taskCode,
        Long implementationId,
        Long implementationBindingId,
        String payloadSchema,
        String documentType,
        Long residentId,
        Long encounterId,
        Long organizationId,
        Long departmentId,
        String purpose,
        String fileName,
        String mediaType,
        String contentDigestAlgorithm,
        String contentDigest,
        Instant generatedAt,
        Long generatedBy,
        String templateCode,
        String templateName,
        int templateVersion,
        String downloadUrl,
        List<JobView> jobs
) {
    public record JobView(
            Long jobId,
            Long originalJobId,
            String requestType,
            String status,
            int copies,
            Instant requestedAt,
            Long requestedBy
    ) {}
}
