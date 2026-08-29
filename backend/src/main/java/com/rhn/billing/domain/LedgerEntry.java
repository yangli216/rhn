package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "ledger_entries")
public class LedgerEntry {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "patient_account_id", nullable = false) private Long patientAccountId;
    @Column(name = "entry_type", nullable = false) private String entryType;
    @Column(nullable = false) private String direction;
    @Column(nullable = false, precision = 24, scale = 6) private BigDecimal amount;
    @Column(name = "currency_code", nullable = false) private String currencyCode;
    @Column(name = "charge_item_id") private Long chargeItemId;
    @Column(name = "invoice_id") private Long invoiceId;
    @Column(name = "payment_id") private Long paymentId;
    @Column(name = "reverses_ledger_entry_id") private Long reversesLedgerEntryId;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    @Column(name = "recorded_at", nullable = false) private Instant recordedAt;
    @Column(name = "recorded_by", nullable = false) private Long recordedBy;

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

    public Long id() { return id; }
    public Long patientAccountId() { return patientAccountId; }
    public String entryType() { return entryType; }
    public String direction() { return direction; }
    public BigDecimal amount() { return amount; }
    public String currencyCode() { return currencyCode; }
    public Long chargeItemId() { return chargeItemId; }
    public Long invoiceId() { return invoiceId; }
    public Long paymentId() { return paymentId; }
    public Long reversesLedgerEntryId() { return reversesLedgerEntryId; }
    public Instant occurredAt() { return occurredAt; }
    public Instant recordedAt() { return recordedAt; }
    public Long recordedBy() { return recordedBy; }
}
