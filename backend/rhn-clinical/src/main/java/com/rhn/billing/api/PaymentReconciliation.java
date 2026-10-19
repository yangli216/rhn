package com.rhn.billing.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

/** Channel-owned statement protocol; no credentials or payer identifiers leave the adapter. */
public final class PaymentReconciliation {
    private PaymentReconciliation() {}
    public static final String READ = "PAYMENT_RECONCILIATION.READ";
    public static final String RUN = "PAYMENT_RECONCILIATION.RUN";
    public static final String HANDLE = "PAYMENT_RECONCILIATION.HANDLE";
    public static final String REVIEW = "PAYMENT_RECONCILIATION.REVIEW";
    public static final String EXPORT = "PAYMENT_RECONCILIATION.EXPORT";
    public static final String MERCHANT_READ = "PAYMENT_RECONCILIATION.MERCHANT_READ";
    public record StatementCapability(@DictionaryBinding("PAY_METHOD") String paymentMethodCode,
            String adapterCode, String name, String billType, String zoneId, String availableAfter,
            int historyDays, String parserVersion) {}
    public record MerchantScope(String fingerprint, String merchantId, String environment, String appId) {
        @Override public String toString() { return "MerchantScope[" + fingerprint + "]"; }
    }
    public record StatementRequest(Long tenantId, Long credentialOrganizationId, MerchantScope scope,
            LocalDate businessDate, String currencyCode, Long taskId, int attempt) {}
    public enum FetchState { AVAILABLE, NOT_READY, NO_DATA_CONFIRMED, NOT_FOUND, AUTH_FAILED, RATE_LIMITED, UNSUPPORTED }
    public record StatementFile(String name, byte[] content) {
        public StatementFile { content = content.clone(); }
        @Override public byte[] content() { return content.clone(); }
        @Override public String toString() { return "StatementFile[content=REDACTED]"; }
    }
    public record StatementDownload(FetchState state, List<StatementFile> files, String proof, StatementFile transportFile) {
        public StatementDownload(FetchState state,List<StatementFile> files,String proof){this(state,files,proof,files.size()==1?files.getFirst():null);}
        public StatementDownload { files = List.copyOf(files); }
        @Override public String toString() { return "StatementDownload[state=" + state + "]"; }
    }
    public enum StatementOutcome { SUCCEEDED, PENDING, FAILED }
    public record StatementRow(int lineNumber, String transactionType, String merchantOrderNo,
            String externalTransactionNo, String refundRequestNo, String externalRefundNo,
            String originalExternalTransactionNo, BigDecimal amount, BigDecimal settlementAmount,
            BigDecimal fee, String currencyCode, String channelStatus, StatementOutcome outcome,
            Instant occurredAt, String merchantId, String appId) {
        public boolean finalSuccess(){return outcome==StatementOutcome.SUCCEEDED;}
        public StatementRow(int line,String type,String order,String txn,String refund,String externalRefund,String original,BigDecimal amount,BigDecimal settlement,BigDecimal fee,String currency,String status,boolean succeeded,Instant occurred,String merchant,String app){this(line,type,order,txn,refund,externalRefund,original,amount,settlement,fee,currency,status,succeeded?StatementOutcome.SUCCEEDED:StatementOutcome.PENDING,occurred,merchant,app);}
    }
    public record StatementSummary(int count, BigDecimal payments, BigDecimal refunds,
            BigDecimal settlementPayments, BigDecimal settlementRefunds, BigDecimal fees) {}
    public record ParsedStatement(List<StatementRow> rows, StatementSummary summary, String parserVersion) {
        public ParsedStatement { rows = List.copyOf(rows); }
    }
    public static class StatementProtocolException extends RuntimeException {
        public StatementProtocolException(String safeMessage) { super(safeMessage); }
    }
}
