package com.rhn.healthcore.clinicaldocument;

import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.List;

public record ClinicalDocumentResponse(
        Long id,
        Long residentId,
        Long encounterId,
        Long organizationId,
        Long departmentId,
        String documentType,
        String title,
        String status,
        int currentVersion,
        JsonNode content,
        String contentSchema,
        String createdBy,
        Instant createdAt,
        Instant updatedAt,
        List<VersionView> history
) {
    public record VersionView(int version, String changeType, String changeReason,
                              String createdBy, Instant createdAt,
                              String signedBy, Instant signedAt, String signatureMeaning,
                              String contentDigestAlgorithm, String contentDigest,
                              Long integrityEvidenceId, Long signatureEvidenceId) {}
}
