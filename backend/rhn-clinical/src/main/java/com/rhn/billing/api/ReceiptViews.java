package com.rhn.billing.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class ReceiptViews {
    private ReceiptViews() {}
    public record ReceiptView(Long id, long revision, Long settlementId, Long reversesReceiptId,
                              String receiptNo, String commandCode, @DictionaryBinding("BIL_RECEIPT_TYPE") String receiptType,
                              @DictionaryBinding("BIL_RECEIPT_STATUS") String status,
                              String fiscalAuthorityCode, String externalReceiptNo, String fiscalCode, String fiscalNumber,
                              String verificationCode, String controlledObjectReference,
                              BigDecimal amount, String currencyCode,
                              @DictionaryBinding("PAY_USE_SCENE") String issueChannel,
                              String payerName, String correlationId, Long createdBy, Instant createdAt,
                              Instant issuedAt, Instant updatedAt, String errorCode, String errorMessage,
                              boolean duplicate, List<ReceiptEventView> events) {}
    public record ReceiptEventView(Long id, Long externalMessageId, @DictionaryBinding("BIL_RECEIPT_EVENT_TYPE") String eventType, @DictionaryBinding("BIL_RECEIPT_STATUS") String statusFrom,
                                   @DictionaryBinding("BIL_RECEIPT_STATUS") String statusTo, String commandCode, Long actorId, String errorCode,
                                   String actionReason, String errorMessage, Instant occurredAt) {}
}
