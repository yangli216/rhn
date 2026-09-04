package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_BIL_LEDGER_ENTRY")
public class LedgerEntry {
    @Id @Column(name = "ID_LEDGER_ENTRY") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT_ACCT", nullable = false) private Long patientAccountId;
    @Column(name = "SD_ENTRY_TYPE", nullable = false) private String entryType;
    @Column(name = "SD_DIRECTION", nullable = false) private String direction;
    @Column(name = "AMT_ENTRY", nullable = false, precision = 24, scale = 6) private BigDecimal amount;
    @Column(name = "CD_CURRENCY", nullable = false) private String currencyCode;
    @Column(name = "ID_CHARGE_ITEM") private Long chargeItemId;
    @Column(name = "ID_INVOICE") private Long invoiceId;
    @Column(name = "ID_PAY") private Long paymentId;
    @Column(name = "ID_CLAIM_RESP") private Long claimResponseId;
    @Column(name = "ID_LEDGER_ENTRY_REVERSES") private Long reversesLedgerEntryId;
    @Column(name = "DT_OCCURRED", nullable = false) private Instant occurredAt;
    @Column(name = "DT_RECORDED", nullable = false) private Instant recordedAt;
    @Column(name = "ID_USER_RECORDED", nullable = false) private Long recordedBy;

    protected LedgerEntry() {}

    public LedgerEntry(Long tenantId, Long patientAccountId, String entryType, String direction,
                       BigDecimal amount, String currencyCode, Long chargeItemId, Long invoiceId,
                       Long paymentId, Long reversesLedgerEntryId, Instant occurredAt, Long recordedBy) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.patientAccountId = patientAccountId;
        this.entryType = entryType; this.direction = direction; this.amount = amount;
        this.currencyCode = currencyCode; this.chargeItemId = chargeItemId; this.invoiceId = invoiceId;
        this.paymentId = paymentId; this.reversesLedgerEntryId = reversesLedgerEntryId;
        this.occurredAt = occurredAt; this.recordedAt = Instant.now(); this.recordedBy = recordedBy;
    }

    public static LedgerEntry insurance(Long tenantId, Long patientAccountId, String entryType,
                                        BigDecimal amount, String currencyCode, Long invoiceId,
                                        Long claimResponseId, Instant occurredAt, Long recordedBy) {
        LedgerEntry value = new LedgerEntry(tenantId, patientAccountId, entryType, "CREDIT", amount,
                currencyCode, null, invoiceId, null, null, occurredAt, recordedBy);
        value.claimResponseId = claimResponseId;
        return value;
    }

    public static LedgerEntry insuranceReversal(Long tenantId, Long patientAccountId, String entryType,
                                                BigDecimal amount, String currencyCode, Long invoiceId,
                                                Long claimResponseId, Long reversesLedgerEntryId,
                                                Instant occurredAt, Long recordedBy) {
        LedgerEntry value = new LedgerEntry(tenantId, patientAccountId, entryType, "DEBIT", amount,
                currencyCode, null, invoiceId, null, reversesLedgerEntryId, occurredAt, recordedBy);
        value.claimResponseId = claimResponseId;
        return value;
    }

    public Long id() { return id; }
    public Long patientAccountId() { return patientAccountId; }
    public String entryType() { return entryType; }
    public String direction() { return direction; }
    public BigDecimal amount() { return amount; }
    public String currencyCode() { return currencyCode; }
    public Long chargeItemId() { return chargeItemId; }
    public Long invoiceId() { return invoiceId; }
    public Long paymentId() { return paymentId; }
    public Long claimResponseId() { return claimResponseId; }
    public Long reversesLedgerEntryId() { return reversesLedgerEntryId; }
    public Instant occurredAt() { return occurredAt; }
    public Instant recordedAt() { return recordedAt; }
    public Long recordedBy() { return recordedBy; }
}
