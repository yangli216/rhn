package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "RHN_BIL_CASHIER_CLOSE_LINE")
public class CashierCloseLine {
    @Id @Column(name = "ID_CASHIER_CLOSE_LINE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CASHIER_CLOSE", nullable = false) private Long cashierCloseId;
    @Column(name = "SN_LINE", nullable = false) private int lineNo;
    @Column(name = "CD_PAY_METHOD", nullable = false) private String paymentMethodCode;
    @Column(name = "SD_CLOSE_LINE_TYPE", nullable = false) private String closeLineType;
    @Column(name = "QTY_TXN", nullable = false) private int transactionCount;
    @Column(name = "AMT_EXPECTED", nullable = false, precision = 24, scale = 6) private BigDecimal expectedAmount;
    @Column(name = "AMT_ACTUAL", nullable = false, precision = 24, scale = 6) private BigDecimal actualAmount;
    @Column(name = "AMT_DIFFERENCE", nullable = false, precision = 24, scale = 6) private BigDecimal differenceAmount;
    @Column(name = "CD_CURRENCY", nullable = false) private String currencyCode;

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
