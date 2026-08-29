package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "cashier_close_lines")
public class CashierCloseLine {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "cashier_close_id", nullable = false) private Long cashierCloseId;
    @Column(name = "line_no", nullable = false) private int lineNo;
    @Column(name = "payment_method_code", nullable = false) private String paymentMethodCode;
    @Column(name = "close_line_type", nullable = false) private String closeLineType;
    @Column(name = "transaction_count", nullable = false) private int transactionCount;
    @Column(name = "expected_amount", nullable = false, precision = 24, scale = 6) private BigDecimal expectedAmount;
    @Column(name = "actual_amount", nullable = false, precision = 24, scale = 6) private BigDecimal actualAmount;
    @Column(name = "difference_amount", nullable = false, precision = 24, scale = 6) private BigDecimal differenceAmount;
    @Column(name = "currency_code", nullable = false) private String currencyCode;

    protected CashierCloseLine() {}
    public CashierCloseLine(Long tenantId, Long cashierCloseId, int lineNo, String paymentMethodCode,
                            String closeLineType, int transactionCount, BigDecimal expectedAmount,
                            BigDecimal actualAmount, String currencyCode) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.cashierCloseId = cashierCloseId;
        this.lineNo = lineNo; this.paymentMethodCode = paymentMethodCode; this.closeLineType = closeLineType;
        this.transactionCount = transactionCount; this.expectedAmount = expectedAmount;
        this.actualAmount = actualAmount; this.differenceAmount = actualAmount.subtract(expectedAmount);
        this.currencyCode = currencyCode;
    }
    public Long id() { return id; }
    public Long cashierCloseId() { return cashierCloseId; }
    public int lineNo() { return lineNo; }
    public String paymentMethodCode() { return paymentMethodCode; }
    public String closeLineType() { return closeLineType; }
    public int transactionCount() { return transactionCount; }
    public BigDecimal expectedAmount() { return expectedAmount; }
    public BigDecimal actualAmount() { return actualAmount; }
    public BigDecimal differenceAmount() { return differenceAmount; }
    public String currencyCode() { return currencyCode; }
}
