package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "goods_receipt_lines")
public class GoodsReceiptLine {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "goods_receipt_id", nullable = false) private Long goodsReceiptId;
    @Column(name = "purchase_order_line_id", nullable = false) private Long purchaseOrderLineId;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(name = "stock_item_id", nullable = false) private Long stockItemId;
    @Column(name = "package_id", nullable = false) private Long packageId;
    @Column(name = "destination_bin_id", nullable = false) private Long destinationBinId;
    @Column(name = "lot_no", nullable = false) private String lotNo;
    @Column(name = "production_date") private LocalDate productionDate;
    @Column(name = "expiry_date") private LocalDate expiryDate;
    @Column(name = "delivered_quantity", nullable = false, precision = 28, scale = 8) private BigDecimal deliveredQuantity;
    @Column(name = "accepted_quantity", precision = 28, scale = 8) private BigDecimal acceptedQuantity;
    @Column(name = "rejected_quantity", precision = 28, scale = 8) private BigDecimal rejectedQuantity;
    @Column(name = "unit_cost", nullable = false, precision = 24, scale = 6) private BigDecimal unitCost;
    @Column(name = "quality_status", nullable = false) private String qualityStatus;
    @Column(name = "rejection_reason") private String rejectionReason;
    @Column(name = "stock_lot_id") private Long stockLotId;
    @Column(name = "inventory_transaction_id") private Long inventoryTransactionId;

    protected GoodsReceiptLine() {}

    public GoodsReceiptLine(Long tenantId, Long goodsReceiptId, Long purchaseOrderLineId, int sortOrder,
                            Long stockItemId, Long packageId, Long destinationBinId, String lotNo,
                            LocalDate productionDate, LocalDate expiryDate, BigDecimal deliveredQuantity,
                            BigDecimal unitCost) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.goodsReceiptId = goodsReceiptId;
        this.purchaseOrderLineId = purchaseOrderLineId; this.sortOrder = sortOrder; this.stockItemId = stockItemId;
        this.packageId = packageId; this.destinationBinId = destinationBinId; this.lotNo = lotNo;
        this.productionDate = productionDate; this.expiryDate = expiryDate; this.deliveredQuantity = deliveredQuantity;
        this.unitCost = unitCost; this.qualityStatus = "PENDING";
    }

    public void inspect(BigDecimal accepted, BigDecimal rejected, String reason) {
        if (accepted == null || rejected == null || accepted.signum() < 0 || rejected.signum() < 0
                || accepted.add(rejected).compareTo(deliveredQuantity) != 0) {
            throw new IllegalStateException("验收合格数与拒收数之和必须等于到货数");
        }
        if (rejected.signum() > 0 && (reason == null || reason.isBlank())) {
            throw new IllegalStateException("存在拒收数量时必须填写拒收原因");
        }
        acceptedQuantity = accepted; rejectedQuantity = rejected; rejectionReason = reason;
        qualityStatus = accepted.signum() > 0 ? "QUALIFIED" : "REJECTED";
    }

    public void markPosted(Long lotId, Long transactionId) {
        if (!"QUALIFIED".equals(qualityStatus) || acceptedQuantity == null || acceptedQuantity.signum() <= 0) {
            throw new IllegalStateException("未验收合格的明细不能入库");
        }
        stockLotId = lotId; inventoryTransactionId = transactionId;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long goodsReceiptId() { return goodsReceiptId; }
    public Long purchaseOrderLineId() { return purchaseOrderLineId; }
    public int sortOrder() { return sortOrder; }
    public Long stockItemId() { return stockItemId; }
    public Long packageId() { return packageId; }
    public Long destinationBinId() { return destinationBinId; }
    public String lotNo() { return lotNo; }
    public LocalDate productionDate() { return productionDate; }
    public LocalDate expiryDate() { return expiryDate; }
    public BigDecimal deliveredQuantity() { return deliveredQuantity; }
    public BigDecimal acceptedQuantity() { return acceptedQuantity; }
    public BigDecimal rejectedQuantity() { return rejectedQuantity; }
    public BigDecimal unitCost() { return unitCost; }
    public String qualityStatus() { return qualityStatus; }
    public String rejectionReason() { return rejectionReason; }
    public Long stockLotId() { return stockLotId; }
    public Long inventoryTransactionId() { return inventoryTransactionId; }
}
