package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_BIL_CASHIER_CLOSE")
public class CashierClose {
    @Id @Column(name = "ID_CASHIER_CLOSE") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_CASHIER_USER", nullable = false) private Long cashierUserId;
    @Column(name = "ID_CASHIER_CLOSE_REVERSES") private Long reversesCloseId;
    @Column(name = "CD_CLOSE_NO", nullable = false) private String closeNo;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "CD_TERMINAL", nullable = false) private String terminalCode;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_RANGE_FROM", nullable = false) private Instant rangeFrom;
    @Column(name = "DT_RANGE_TO", nullable = false) private Instant rangeTo;
    @Column(name = "QTY_TXN", nullable = false) private int transactionCount;
    @Column(name = "AMT_EXPECTED", nullable = false, precision = 24, scale = 6) private BigDecimal expectedAmount;
    @Column(name = "AMT_ACTUAL", nullable = false, precision = 24, scale = 6) private BigDecimal actualAmount;
    @Column(name = "AMT_DIFFERENCE", nullable = false, precision = 24, scale = 6) private BigDecimal differenceAmount;
    @Column(name = "CD_CURRENCY", nullable = false) private String currencyCode;
    @Column(name = "DES_DIFFERENCE_REASON") private String differenceReason;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CONFIRMED") private Long confirmedBy;
    @Column(name = "DT_CONFIRMED") private Instant confirmedAt;

    protected CashierClose() {}

    public CashierClose(Long tenantId, Long organizationId, Long cashierUserId, Long reversesCloseId,
                        String closeNo, String commandCode, String terminalCode, String status,
                        Instant rangeFrom, Instant rangeTo, int transactionCount, BigDecimal expectedAmount,
                        BigDecimal actualAmount, BigDecimal differenceAmount, String currencyCode, Long createdBy) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.cashierUserId = cashierUserId; this.reversesCloseId = reversesCloseId; this.closeNo = closeNo;
        this.commandCode = commandCode; this.terminalCode = terminalCode; this.status = status;
        this.rangeFrom = rangeFrom; this.rangeTo = rangeTo; this.transactionCount = transactionCount;
        this.expectedAmount = expectedAmount; this.actualAmount = actualAmount;
        this.differenceAmount = differenceAmount; this.currencyCode = currencyCode;
        this.createdBy = createdBy; this.createdAt = Instant.now();
    }

    public void confirm(Long actorId, String reason) {
        this.status = "CONFIRMED"; this.confirmedBy = actorId; this.confirmedAt = Instant.now();
        this.differenceReason = reason;
    }

    public void markReversed() { this.status = "REVERSED"; }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long cashierUserId() { return cashierUserId; }
    public Long reversesCloseId() { return reversesCloseId; }
    public String closeNo() { return closeNo; }
    public String commandCode() { return commandCode; }
    public String terminalCode() { return terminalCode; }
    public String status() { return status; }
    public Instant rangeFrom() { return rangeFrom; }
    public Instant rangeTo() { return rangeTo; }
    public int transactionCount() { return transactionCount; }
    public BigDecimal expectedAmount() { return expectedAmount; }
    public BigDecimal actualAmount() { return actualAmount; }
    public BigDecimal differenceAmount() { return differenceAmount; }
    public String currencyCode() { return currencyCode; }
    public String differenceReason() { return differenceReason; }
    public Long createdBy() { return createdBy; }
    public Instant createdAt() { return createdAt; }
    public Long confirmedBy() { return confirmedBy; }
    public Instant confirmedAt() { return confirmedAt; }
}
