package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "inventory_transaction_lines")
public class InventoryTransactionLine {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "inventory_transaction_id", nullable = false) private Long inventoryTransactionId;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(name = "stock_site_id", nullable = false) private Long stockSiteId;
    @Column(name = "stock_bin_id", nullable = false) private Long stockBinId;
    @Column(name = "stock_item_id", nullable = false) private Long stockItemId;
    @Column(name = "stock_lot_id", nullable = false) private Long stockLotId;
    @Column(name = "package_id", nullable = false) private Long packageId;
    @Column(name = "stock_status", nullable = false) private String stockStatus;
    @Column(name = "operation_quantity", nullable = false, precision = 28, scale = 8) private BigDecimal operationQuantity;
    @Column(name = "operation_unit_code", nullable = false) private String operationUnitCode;
    @Column(name = "base_quantity_factor", nullable = false, precision = 28, scale = 8) private BigDecimal baseQuantityFactor;
    @Column(name = "quantity_delta", nullable = false, precision = 28, scale = 8) private BigDecimal quantityDelta;
    @Column(name = "unit_cost", precision = 24, scale = 6) private BigDecimal unitCost;
    @Column(name = "amount_delta", precision = 24, scale = 6) private BigDecimal amountDelta;

    protected InventoryTransactionLine() {}

    public InventoryTransactionLine(Long tenantId, Long inventoryTransactionId, int sortOrder,
                                    Long stockSiteId, Long stockBinId, Long stockItemId, Long stockLotId,
                                    Long packageId, String stockStatus, BigDecimal operationQuantity,
                                    String operationUnitCode, BigDecimal baseQuantityFactor,
                                    BigDecimal quantityDelta, BigDecimal unitCost) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.inventoryTransactionId = inventoryTransactionId;
        this.sortOrder = sortOrder; this.stockSiteId = stockSiteId; this.stockBinId = stockBinId;
        this.stockItemId = stockItemId; this.stockLotId = stockLotId; this.packageId = packageId;
        this.stockStatus = stockStatus; this.operationQuantity = operationQuantity;
        this.operationUnitCode = operationUnitCode; this.baseQuantityFactor = baseQuantityFactor;
        this.quantityDelta = quantityDelta; this.unitCost = unitCost;
        this.amountDelta = unitCost == null ? null : unitCost.multiply(quantityDelta);
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long inventoryTransactionId() { return inventoryTransactionId; }
    public int sortOrder() { return sortOrder; }
    public Long stockSiteId() { return stockSiteId; }
    public Long stockBinId() { return stockBinId; }
    public Long stockItemId() { return stockItemId; }
    public Long stockLotId() { return stockLotId; }
    public Long packageId() { return packageId; }
    public String stockStatus() { return stockStatus; }
    public BigDecimal operationQuantity() { return operationQuantity; }
    public String operationUnitCode() { return operationUnitCode; }
    public BigDecimal baseQuantityFactor() { return baseQuantityFactor; }
    public BigDecimal quantityDelta() { return quantityDelta; }
    public BigDecimal unitCost() { return unitCost; }
    public BigDecimal amountDelta() { return amountDelta; }
}
