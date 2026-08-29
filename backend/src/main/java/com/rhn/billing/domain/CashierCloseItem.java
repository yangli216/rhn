package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "cashier_close_items")
public class CashierCloseItem {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "cashier_close_id", nullable = false) private Long cashierCloseId;
    @Column(name = "payment_id", nullable = false) private Long paymentId;
    @Column(name = "item_no", nullable = false) private int itemNo;
    @Column(name = "item_amount", nullable = false, precision = 24, scale = 6) private BigDecimal itemAmount;
    @Column(name = "currency_code", nullable = false) private String currencyCode;

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
