package com.rhn.platform.cryptography.api;


public record EvidenceVerification(
        Long evidenceId,
        boolean valid,
        boolean contentIntact,
        boolean statementDigestValid,
        boolean signatureValid,
        boolean statementBound,
        boolean chainLinkValid,
        String status,
        String providerCode,
        String providerAssurance
) {}
