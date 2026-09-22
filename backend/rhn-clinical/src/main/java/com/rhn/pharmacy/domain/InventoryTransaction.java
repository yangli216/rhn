package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_INV_TXN")
public class InventoryTransaction {
    @Id @Column(name = "ID_INV_TXN") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_INV_PERIOD", nullable = false) private Long inventoryPeriodId;
    @Column(name = "ID_INV_TXN_RVRS") private Long reversesTransactionId;
    @Column(name = "CD_TXN_NO", nullable = false) private String transactionNo;
    @Column(name = "CD_REQ", nullable = false) private String requestCode;
    @Column(name = "SD_TXN_TYPE", nullable = false) private String transactionType;
    @Column(name = "SD_SRC_TYPE", nullable = false) private String sourceType;
    @Column(name = "CD_SRC", nullable = false) private String sourceCode;
    @Column(name = "DT_OCCRD", nullable = false) private Instant occurredAt;
    @Column(name = "DT_POSTED", nullable = false) private Instant postedAt;
    @Column(name = "ID_USER_POSTED", nullable = false) private Long postedBy;
    @Column(name = "DES_INV_TXN") private String description;

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
