package com.rhn.billing.domain;

import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptResult;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "receipts")
public class Receipt {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "settlement_id", nullable = false) private Long settlementId;
    @Column(name = "reverses_receipt_id") private Long reversesReceiptId;
    @Column(name = "receipt_no", nullable = false) private String receiptNo;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "receipt_type", nullable = false) private String receiptType;
    @Column(nullable = false) private String status;
    @Column(name = "fiscal_authority_code") private String fiscalAuthorityCode;
    @Column(name = "external_receipt_no") private String externalReceiptNo;
    @Column(name = "fiscal_code") private String fiscalCode;
    @Column(name = "fiscal_number") private String fiscalNumber;
    @Column(name = "verification_code") private String verificationCode;
    @Column(name = "controlled_object_reference") private String controlledObjectReference;
    @Column(name = "receipt_amount", nullable = false, precision = 24, scale = 6) private BigDecimal receiptAmount;
    @Column(name = "currency_code", nullable = false) private String currencyCode;
    @Column(name = "issue_channel", nullable = false) private String issueChannel;
    @Column(name = "payer_name_snapshot") private String payerNameSnapshot;
    @Column(name = "payer_identity_digest") private String payerIdentityDigest;
    @Column(name = "correlation_id") private String correlationId;
    @Column(name = "created_by") private Long createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "issued_at") private Instant issuedAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "error_code") private String errorCode;
    @Column(name = "error_message") private String errorMessage;

    protected Receipt() {}

    public Receipt(Long tenantId, Long settlementId, String commandCode, String receiptType,
                   String fiscalAuthorityCode, BigDecimal amount, String currencyCode, String issueChannel,
                   String payerName, String payerIdentityDigest, String correlationId, Long createdBy) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.settlementId = settlementId;
        this.receiptNo = "RC" + id; this.commandCode = commandCode; this.receiptType = receiptType;
        this.status = "REQUESTED"; this.fiscalAuthorityCode = fiscalAuthorityCode;
        this.receiptAmount = amount; this.currencyCode = currencyCode; this.issueChannel = issueChannel;
        this.payerNameSnapshot = payerName; this.payerIdentityDigest = payerIdentityDigest;
        this.correlationId = correlationId; this.createdBy = createdBy;
        this.createdAt = Instant.now(); this.updatedAt = createdAt;
    }

    public static Receipt redFlushOf(Receipt original, String commandCode, String correlationId, Long createdBy) {
        Receipt value = new Receipt(original.tenantId, original.settlementId, commandCode, original.receiptType,
                original.fiscalAuthorityCode, original.receiptAmount.negate(), original.currencyCode,
                original.issueChannel, original.payerNameSnapshot, original.payerIdentityDigest,
                correlationId, createdBy);
        value.reversesReceiptId = original.id;
        return value;
    }

    public String applyIssueResult(ReceiptResult result) {
        String previous = status;
        if ("VOIDED".equals(status) || "RED_FLUSHED".equals(status)) {
            throw new IllegalStateException("终态票据不能再接收开具结果");
        }
        if ("ISSUED".equals(status)) {
            if (result.outcome() != ReceiptResult.Outcome.ISSUED) return previous;
            requireSameFiscalIdentity(result);
            return previous;
        }
        if (result.outcome() == ReceiptResult.Outcome.VOIDED
                || result.outcome() == ReceiptResult.Outcome.RED_FLUSHED) {
            throw new IllegalStateException("开具流程不能接收作废或红冲结果");
        }
        mergeExternalReceiptNo(result.externalReceiptNo());
        switch (result.outcome()) {
            case ISSUED -> {
                status = "ISSUED"; fiscalCode = result.fiscalCode(); fiscalNumber = result.fiscalNumber();
                verificationCode = result.verificationCode(); controlledObjectReference = result.controlledObjectReference();
                issuedAt = result.issuedAt() == null ? Instant.now() : result.issuedAt(); errorCode = null; errorMessage = null;
            }
            case FAILED -> { status = "FAILED"; errorCode = result.errorCode(); errorMessage = result.errorMessage(); }
            case PENDING -> { status = "REQUESTED"; errorCode = result.errorCode(); errorMessage = result.errorMessage(); }
            case VOIDED -> { status = "VOIDED"; errorCode = null; errorMessage = null; }
            case RED_FLUSHED -> { status = "RED_FLUSHED"; errorCode = null; errorMessage = null; }
        }
        updatedAt = Instant.now(); return previous;
    }

    public String applyVoidResult(ReceiptResult result) {
        String previous = status;
        if ("VOIDED".equals(status)) {
            if (result.outcome() == ReceiptResult.Outcome.VOIDED) return previous;
            throw new IllegalStateException("已作废票据不能迁移到其他状态");
        }
        if (!"ISSUED".equals(status)) throw new IllegalStateException("只有已开具票据可以作废");
        mergeExternalReceiptNo(result.externalReceiptNo());
        if (result.outcome() == ReceiptResult.Outcome.VOIDED) {
            status = "VOIDED"; errorCode = null; errorMessage = null; updatedAt = Instant.now();
        } else if (result.outcome() == ReceiptResult.Outcome.PENDING || result.outcome() == ReceiptResult.Outcome.FAILED) {
            errorCode = result.errorCode(); errorMessage = result.errorMessage(); updatedAt = Instant.now();
        } else {
            throw new IllegalStateException("作废流程收到不兼容的票据结果");
        }
        return previous;
    }

    public String applyRedFlushResult(ReceiptResult result) {
        String previous = status;
        if (reversesReceiptId == null) throw new IllegalStateException("当前票据不是红冲票据");
        if ("RED_FLUSHED".equals(status)) {
            if (result.outcome() == ReceiptResult.Outcome.RED_FLUSHED) return previous;
            throw new IllegalStateException("已红冲票据不能迁移到其他状态");
        }
        if (!"REQUESTED".equals(status) && !"FAILED".equals(status)) {
            throw new IllegalStateException("当前红冲票据状态不能接收红冲结果");
        }
        mergeExternalReceiptNo(result.externalReceiptNo());
        switch (result.outcome()) {
            case RED_FLUSHED -> {
                status = "RED_FLUSHED"; fiscalCode = result.fiscalCode(); fiscalNumber = result.fiscalNumber();
                verificationCode = result.verificationCode(); controlledObjectReference = result.controlledObjectReference();
                issuedAt = result.issuedAt() == null ? Instant.now() : result.issuedAt(); errorCode = null; errorMessage = null;
            }
            case FAILED -> { status = "FAILED"; errorCode = result.errorCode(); errorMessage = result.errorMessage(); }
            case PENDING -> { status = "REQUESTED"; errorCode = result.errorCode(); errorMessage = result.errorMessage(); }
            default -> throw new IllegalStateException("红冲流程收到不兼容的票据结果");
        }
        updatedAt = Instant.now();
        return previous;
    }

    private void mergeExternalReceiptNo(String value) {
        if (value == null || value.isBlank()) return;
        String normalized = value.trim();
        if (externalReceiptNo != null && !externalReceiptNo.equals(normalized)) {
            throw new IllegalStateException("外部票据号与既有开具结果不一致");
        }
        externalReceiptNo = normalized;
    }

    private void requireSameFiscalIdentity(ReceiptResult result) {
        mergeExternalReceiptNo(result.externalReceiptNo());
        if (fiscalCode != null && result.fiscalCode() != null && !fiscalCode.equals(result.fiscalCode())) {
            throw new IllegalStateException("财政票据代码与既有开具结果不一致");
        }
        if (fiscalNumber != null && result.fiscalNumber() != null && !fiscalNumber.equals(result.fiscalNumber())) {
            throw new IllegalStateException("财政票据号码与既有开具结果不一致");
        }
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long settlementId() { return settlementId; }
    public Long reversesReceiptId() { return reversesReceiptId; }
    public String receiptNo() { return receiptNo; }
    public String commandCode() { return commandCode; }
    public String receiptType() { return receiptType; }
    public String status() { return status; }
    public String fiscalAuthorityCode() { return fiscalAuthorityCode; }
    public String externalReceiptNo() { return externalReceiptNo; }
    public String fiscalCode() { return fiscalCode; }
    public String fiscalNumber() { return fiscalNumber; }
    public String verificationCode() { return verificationCode; }
    public String controlledObjectReference() { return controlledObjectReference; }
    public BigDecimal receiptAmount() { return receiptAmount; }
    public String currencyCode() { return currencyCode; }
    public String issueChannel() { return issueChannel; }
    public String payerName() { return payerNameSnapshot; }
    public String payerIdentityDigest() { return payerIdentityDigest; }
    public String correlationId() { return correlationId; }
    public Long createdBy() { return createdBy; }
    public Instant createdAt() { return createdAt; }
    public Instant issuedAt() { return issuedAt; }
    public Instant updatedAt() { return updatedAt; }
    public String errorCode() { return errorCode; }
    public String errorMessage() { return errorMessage; }
}
