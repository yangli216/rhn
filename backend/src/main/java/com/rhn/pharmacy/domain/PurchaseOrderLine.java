package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;

@Entity
@Table(name = "RHN_SUP_PURCH_ORDER_LINE")
public class PurchaseOrderLine {
    @Id @Column(name = "ID_PURCH_ORDER_LINE") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PURCH_ORDER", nullable = false) private Long purchaseOrderId;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;
    @Column(name = "ID_STOCK_ITEM", nullable = false) private Long stockItemId;
    @Column(name = "ID_ITEM_PKG", nullable = false) private Long packageId;
    @Column(name = "QTY_ORDERED", nullable = false, precision = 28, scale = 8) private BigDecimal orderedQuantity;
    @Column(name = "QTY_RECEIVED", nullable = false, precision = 28, scale = 8) private BigDecimal receivedQuantity;
    @Column(name = "PRICE_UNIT", nullable = false, precision = 24, scale = 6) private BigDecimal unitPrice;
    @Column(name = "TAX_RATE", precision = 9, scale = 6) private BigDecimal taxRate;
    @Column(name = "SD_LINE_STATUS", nullable = false) private String lineStatus;
    @Column(name = "DES_PURCH_ORDER_LINE") private String description;

    protected PurchaseOrderLine() {}

    public PurchaseOrderLine(Long tenantId, Long purchaseOrderId, int sortOrder, Long stockItemId,
                             Long packageId, BigDecimal orderedQuantity, BigDecimal unitPrice,
                             BigDecimal taxRate, String description) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.purchaseOrderId = purchaseOrderId;
        this.sortOrder = sortOrder; this.stockItemId = stockItemId; this.packageId = packageId;
        this.orderedQuantity = orderedQuantity; this.receivedQuantity = BigDecimal.ZERO;
        this.unitPrice = unitPrice; this.taxRate = taxRate; this.lineStatus = "OPEN";
        this.description = description;
    }

    public void recordReceipt(BigDecimal quantity) {
        BigDecimal next = receivedQuantity.add(quantity);
        if (quantity.signum() < 0 || next.compareTo(orderedQuantity) > 0) {
            throw new IllegalStateException("累计验收入库数量不能超过采购数量");
        }
        receivedQuantity = next;
        lineStatus = receivedQuantity.compareTo(orderedQuantity) == 0 ? "COMPLETED" : "PARTIALLY_RECEIVED";
    }

    public BigDecimal remainingQuantity() { return orderedQuantity.subtract(receivedQuantity); }
    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long purchaseOrderId() { return purchaseOrderId; }
    public int sortOrder() { return sortOrder; }
    public Long stockItemId() { return stockItemId; }
    public Long packageId() { return packageId; }
    public BigDecimal orderedQuantity() { return orderedQuantity; }
    public BigDecimal receivedQuantity() { return receivedQuantity; }
    public BigDecimal unitPrice() { return unitPrice; }
    public BigDecimal taxRate() { return taxRate; }
    public String lineStatus() { return lineStatus; }
    public String description() { return description; }
}
