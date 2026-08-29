package com.rhn.billing.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class ReceiptViews {
    private ReceiptViews() {}
    public record ReceiptView(Long id, long revision, Long settlementId, Long reversesReceiptId,
                              String receiptNo, String commandCode, String receiptType, String status,
                              String fiscalAuthorityCode, String externalReceiptNo, String fiscalCode, String fiscalNumber,
                              String verificationCode, String controlledObjectReference,
                              BigDecimal amount, String currencyCode, String issueChannel,
                              String payerName, String correlationId, Long createdBy, Instant createdAt,
                              Instant issuedAt, Instant updatedAt, String errorCode, String errorMessage,
                              boolean duplicate, List<ReceiptEventView> events) {}
    public record ReceiptEventView(Long id, Long externalMessageId, String eventType, String statusFrom,
                                   String statusTo, String commandCode, Long actorId, String errorCode,
                                   String actionReason, String errorMessage, Instant occurredAt) {}
}
