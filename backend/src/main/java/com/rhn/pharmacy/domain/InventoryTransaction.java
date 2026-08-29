package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "inventory_transactions")
public class InventoryTransaction {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "inventory_period_id", nullable = false) private Long inventoryPeriodId;
    @Column(name = "reverses_transaction_id") private Long reversesTransactionId;
    @Column(name = "transaction_no", nullable = false) private String transactionNo;
    @Column(name = "request_code", nullable = false) private String requestCode;
    @Column(name = "transaction_type", nullable = false) private String transactionType;
    @Column(name = "source_type", nullable = false) private String sourceType;
    @Column(name = "source_code", nullable = false) private String sourceCode;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    @Column(name = "posted_at", nullable = false) private Instant postedAt;
    @Column(name = "posted_by", nullable = false) private Long postedBy;
    @Column private String description;

    protected InventoryTransaction() {}

    public InventoryTransaction(Long tenantId, Long inventoryPeriodId, String transactionNo,
                                String requestCode, String transactionType, String sourceType,
                                String sourceCode, Instant occurredAt, Long actorId, String description) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.inventoryPeriodId = inventoryPeriodId;
        this.transactionNo = transactionNo; this.requestCode = requestCode; this.transactionType = transactionType;
        this.sourceType = sourceType; this.sourceCode = sourceCode; this.occurredAt = occurredAt;
        this.postedAt = Instant.now(); this.postedBy = actorId; this.description = description;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long inventoryPeriodId() { return inventoryPeriodId; }
    public Long reversesTransactionId() { return reversesTransactionId; }
    public String transactionNo() { return transactionNo; }
    public String requestCode() { return requestCode; }
    public String transactionType() { return transactionType; }
    public String sourceType() { return sourceType; }
    public String sourceCode() { return sourceCode; }
    public Instant occurredAt() { return occurredAt; }
    public Instant postedAt() { return postedAt; }
    public Long postedBy() { return postedBy; }
    public String description() { return description; }
}
