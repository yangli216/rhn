package com.rhn.platform.cryptography.api;

import java.time.Instant;

public record EvidenceReceipt(
        Long evidenceId,
        String profile,
        String purpose,
        String contentDigestAlgorithm,
        String contentDigest,
        String providerCode,
        String providerAssurance,
        String signatureAlgorithm,
        String keyId,
        String signerType,
        Long signerSubjectId,
        String signerName,
        Instant signedAt,
        boolean trustedTimestamp
) {}
