package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "RHN_SUP_INV_TXN_LINE")
public class InventoryTransactionLine {
    @Id @Column(name = "ID_INV_TXN_LINE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_INV_TXN", nullable = false) private Long inventoryTransactionId;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;
    @Column(name = "ID_STOCK_SITE", nullable = false) private Long stockSiteId;
    @Column(name = "ID_STOCK_BIN", nullable = false) private Long stockBinId;
    @Column(name = "ID_STOCK_ITEM", nullable = false) private Long stockItemId;
    @Column(name = "ID_STOCK_LOT", nullable = false) private Long stockLotId;
    @Column(name = "ID_ITEM_PKG", nullable = false) private Long packageId;
    @Column(name = "SD_STOCK_STATUS", nullable = false) private String stockStatus;
    @Column(name = "QTY_OPERATION", nullable = false, precision = 28, scale = 8) private BigDecimal operationQuantity;
    @Column(name = "CD_OPERATION_UNIT", nullable = false) private String operationUnitCode;
    @Column(name = "BASE_QUANTITY_FACTOR", nullable = false, precision = 28, scale = 8) private BigDecimal baseQuantityFactor;
    @Column(name = "QTY_DELTA", nullable = false, precision = 28, scale = 8) private BigDecimal quantityDelta;
    @Column(name = "PRICE_UNIT_COST", precision = 24, scale = 6) private BigDecimal unitCost;
    @Column(name = "AMT_DELTA", precision = 24, scale = 6) private BigDecimal amountDelta;

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
