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
@Table(name = "cashier_closes")
public class CashierClose {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "cashier_user_id", nullable = false) private Long cashierUserId;
    @Column(name = "reverses_close_id") private Long reversesCloseId;
    @Column(name = "close_no", nullable = false) private String closeNo;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "terminal_code", nullable = false) private String terminalCode;
    @Column(nullable = false) private String status;
    @Column(name = "range_from", nullable = false) private Instant rangeFrom;
    @Column(name = "range_to", nullable = false) private Instant rangeTo;
    @Column(name = "transaction_count", nullable = false) private int transactionCount;
    @Column(name = "expected_amount", nullable = false, precision = 24, scale = 6) private BigDecimal expectedAmount;
    @Column(name = "actual_amount", nullable = false, precision = 24, scale = 6) private BigDecimal actualAmount;
    @Column(name = "difference_amount", nullable = false, precision = 24, scale = 6) private BigDecimal differenceAmount;
    @Column(name = "currency_code", nullable = false) private String currencyCode;
    @Column(name = "difference_reason") private String differenceReason;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "confirmed_by") private Long confirmedBy;
    @Column(name = "confirmed_at") private Instant confirmedAt;

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
