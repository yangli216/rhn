package com.rhn.platform.printing.api;

import java.time.Instant;

public record PrintReceipt(
        Long jobId,
        Long outputId,
        Long originalJobId,
        String requestType,
        String status,
        int copies,
        String documentType,
        String templateCode,
        int templateVersion,
        String fileName,
        String contentDigestAlgorithm,
        String contentDigest,
        Instant requestedAt,
        String downloadUrl,
        DeliveryReceipt delivery
) {
    public record DeliveryReceipt(Long id, long revision, Long deviceId, String deviceName,
            String channel, String status, int attemptCount) {}
}
