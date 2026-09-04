package com.rhn.billing.infrastructure.fiscal;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * 财政医疗收费电子票据数据模型 (Fiscal E-Invoice Domain Models)。
 * 对标财政部《医疗收费电子票据管理规范》与各省财政电子票据服务规范。
 */
public final class FiscalModels {
    private FiscalModels() {}

    /** 电子票据开具请求 DTO */
    public record FiscalIssueRequest(
            Long receiptId,
            Long settlementId,
            String receiptRequestNo,
            String idempotencyKey,
            String receiptType,
            String issueChannel,
            String fiscalAuthorityCode,
            String payerName,
            String payerIdentityDigest,
            BigDecimal totalAmount,
            BigDecimal insuranceAmount,
            BigDecimal personalAccountAmount,
            BigDecimal patientAmount,
            String currencyCode,
            List<FiscalItem> items,
            String correlationId
    ) {}

    /** 费用明细条目 DTO */
    public record FiscalItem(
            int lineNo,
            String categoryCode,
            String itemCode,
            String itemName,
            BigDecimal quantity,
            BigDecimal amount
    ) {}

    /** 电子票据开具响应 DTO */
    public record FiscalIssueResponse(
            boolean success,
            String outcome,
            String externalReceiptNo,
            String fiscalCode,
            String fiscalNumber,
            String verificationCode,
            String verifyUrl,
            Instant issuedAt,
            String errorCode,
            String errorMessage
    ) {
        public static FiscalIssueResponse success(String externalReceiptNo, String fiscalCode,
                                                  String fiscalNumber, String verificationCode,
                                                  String verifyUrl, Instant issuedAt) {
            return new FiscalIssueResponse(true, "ISSUED", externalReceiptNo, fiscalCode, fiscalNumber,
                    verificationCode, verifyUrl, issuedAt, null, null);
        }

        public static FiscalIssueResponse failed(String errorCode, String errorMessage) {
            return new FiscalIssueResponse(false, "FAILED", null, null, null, null,
                    null, null, errorCode, errorMessage);
        }
    }

    /** 电子票据作废请求 DTO */
    public record FiscalVoidRequest(
            Long receiptId,
            String receiptRequestNo,
            String idempotencyKey,
            String externalReceiptNo,
            String reason,
            String correlationId
    ) {}

    /** 电子票据作废响应 DTO */
    public record FiscalVoidResponse(
            boolean success,
            String externalReceiptNo,
            Instant voidedAt,
            String errorCode,
            String errorMessage
    ) {
        public static FiscalVoidResponse success(String externalReceiptNo, Instant voidedAt) {
            return new FiscalVoidResponse(true, externalReceiptNo, voidedAt, null, null);
        }

        public static FiscalVoidResponse failed(String errorCode, String errorMessage) {
            return new FiscalVoidResponse(false, null, null, errorCode, errorMessage);
        }
    }

    /** 电子票据冲红（红字作废）请求 DTO */
    public record FiscalRedFlushRequest(
            Long receiptId,
            String receiptRequestNo,
            String idempotencyKey,
            String originalExternalReceiptNo,
            String originalFiscalCode,
            String originalFiscalNumber,
            String reason,
            String correlationId
    ) {}

    /** 电子票据冲红响应 DTO */
    public record FiscalRedFlushResponse(
            boolean success,
            String redExternalReceiptNo,
            String redFiscalCode,
            String redFiscalNumber,
            String verificationCode,
            String verifyUrl,
            Instant issuedAt,
            String errorCode,
            String errorMessage
    ) {
        public static FiscalRedFlushResponse success(String redExternalReceiptNo, String redFiscalCode,
                                                     String redFiscalNumber, String verificationCode,
                                                     String verifyUrl, Instant issuedAt) {
            return new FiscalRedFlushResponse(true, redExternalReceiptNo, redFiscalCode, redFiscalNumber,
                    verificationCode, verifyUrl, issuedAt, null, null);
        }

        public static FiscalRedFlushResponse failed(String errorCode, String errorMessage) {
            return new FiscalRedFlushResponse(false, null, null, null, null, null,
                    null, errorCode, errorMessage);
        }
    }
}
