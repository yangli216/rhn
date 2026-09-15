package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "RHN_BIL_CASHIER_CLOSE_ITEM")
public class CashierCloseItem {
    @Id @Column(name = "ID_CASHIER_CLOSE_ITEM") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CASHIER_CLOSE", nullable = false) private Long cashierCloseId;
    @Column(name = "ID_PAY", nullable = false) private Long paymentId;
    @Column(name = "CD_ITEM_NO", nullable = false) private int itemNo;
    @Column(name = "AMT_ITEM", nullable = false, precision = 24, scale = 6) private BigDecimal itemAmount;
    @Column(name = "CD_CURRENCY", nullable = false) private String currencyCode;

    protected CashierCloseItem() {}
    public CashierCloseItem(Long tenantId, Long cashierCloseId, Long paymentId, int itemNo,
                            BigDecimal itemAmount, String currencyCode) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.cashierCloseId = cashierCloseId;
        this.paymentId = paymentId; this.itemNo = itemNo; this.itemAmount = itemAmount;
        this.currencyCode = currencyCode;
    }
    public Long paymentId() { return paymentId; }
    public BigDecimal itemAmount() { return itemAmount; }
}
