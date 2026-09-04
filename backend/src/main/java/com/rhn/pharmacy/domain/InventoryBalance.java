package com.rhn.pharmacy.domain;

import com.rhn.shared.api.BusinessException;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.math.MathContext;
import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_INV_BAL")
public class InventoryBalance {
    @Id @Column(name = "ID_INV_BAL") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_STOCK_SITE", nullable = false) private Long stockSiteId;
    @Column(name = "ID_STOCK_BIN", nullable = false) private Long stockBinId;
    @Column(name = "ID_STOCK_ITEM", nullable = false) private Long stockItemId;
    @Column(name = "ID_STOCK_LOT", nullable = false) private Long stockLotId;
    @Column(name = "SD_STOCK_STATUS", nullable = false) private String stockStatus;
    @Column(name = "CD_BASE_UNIT", nullable = false) private String baseUnitCode;
    @Column(name = "QTY_ON_HAND", nullable = false, precision = 28, scale = 8) private BigDecimal quantityOnHand;
    @Column(name = "QTY_RESERVED", nullable = false, precision = 28, scale = 8) private BigDecimal quantityReserved;
    @Column(name = "QTY_FROZEN", nullable = false, precision = 28, scale = 8) private BigDecimal quantityFrozen;
    @Column(name = "QTY_AVAILABLE", nullable = false, precision = 28, scale = 8) private BigDecimal quantityAvailable;
    @Column(name = "PRICE_AVERAGE_UNIT_COST", precision = 24, scale = 6) private BigDecimal averageUnitCost;
    @Column(name = "DT_PROJECTED", nullable = false) private Instant projectedAt;

    protected InventoryBalance() {}

    public InventoryBalance(Long tenantId, Long stockSiteId, Long stockBinId, Long stockItemId,
                            Long stockLotId, String stockStatus, String baseUnitCode) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.stockSiteId = stockSiteId;
        this.stockBinId = stockBinId; this.stockItemId = stockItemId; this.stockLotId = stockLotId;
        this.stockStatus = stockStatus; this.baseUnitCode = baseUnitCode;
        this.quantityOnHand = BigDecimal.ZERO; this.quantityReserved = BigDecimal.ZERO;
        this.quantityFrozen = BigDecimal.ZERO; this.quantityAvailable = BigDecimal.ZERO;
        this.projectedAt = Instant.now();
    }

    public void receive(BigDecimal quantity, BigDecimal unitCost) {
        if (quantity.signum() <= 0) throw invalid("INVENTORY_RECEIPT_QUANTITY_INVALID", "入库数量必须大于零");
        if (unitCost != null) {
            BigDecimal oldValue = averageUnitCost == null ? BigDecimal.ZERO
                    : averageUnitCost.multiply(quantityOnHand);
            BigDecimal newQuantity = quantityOnHand.add(quantity);
            averageUnitCost = oldValue.add(unitCost.multiply(quantity)).divide(newQuantity, MathContext.DECIMAL64);
        }
        quantityOnHand = quantityOnHand.add(quantity); recalculate();
    }

    public void reserve(BigDecimal quantity) {
        if (quantity.signum() <= 0 || quantityAvailable.compareTo(quantity) < 0) {
            throw invalid("INVENTORY_RESERVATION_INSUFFICIENT", "可用库存不足，不能完成预留");
        }
        quantityReserved = quantityReserved.add(quantity); recalculate();
    }

    public void release(BigDecimal quantity) {
        if (quantity.signum() <= 0 || quantityReserved.compareTo(quantity) < 0) {
            throw invalid("INVENTORY_RESERVATION_RELEASE_INVALID", "释放数量超过当前预留数量");
        }
        quantityReserved = quantityReserved.subtract(quantity); recalculate();
    }

    public void dispenseReserved(BigDecimal quantity) {
        if (quantity == null || quantity.signum() <= 0 || quantityReserved.compareTo(quantity) < 0
                || quantityOnHand.compareTo(quantity) < 0) {
            throw invalid("INVENTORY_DISPENSE_QUANTITY_INVALID", "发药数量超过在手或已预留数量");
        }
        quantityOnHand = quantityOnHand.subtract(quantity);
        quantityReserved = quantityReserved.subtract(quantity);
        recalculate();
    }

    public void issueAvailable(BigDecimal quantity) {
        if (quantity == null || quantity.signum() <= 0 || quantityAvailable.compareTo(quantity) < 0
                || quantityOnHand.compareTo(quantity) < 0) {
            throw invalid("INVENTORY_ISSUE_QUANTITY_INVALID", "出库数量超过当前可用库存");
        }
        quantityOnHand = quantityOnHand.subtract(quantity);
        recalculate();
    }

    public void adjust(BigDecimal quantityDelta, BigDecimal unitCost) {
        if (quantityDelta == null || quantityDelta.signum() == 0) {
            throw invalid("INVENTORY_ADJUSTMENT_QUANTITY_INVALID", "库存调整数量不能为零");
        }
        if (quantityDelta.signum() > 0) receive(quantityDelta, unitCost);
        else issueAvailable(quantityDelta.abs());
    }

    public void revalueCost(BigDecimal newUnitCost) {
        if (newUnitCost == null || newUnitCost.signum() < 0) {
            throw invalid("INVENTORY_REVALUE_COST_INVALID", "重估后的单位成本不能小于零");
        }
        averageUnitCost = newUnitCost;
        projectedAt = Instant.now();
    }

    private void recalculate() {
        quantityAvailable = quantityOnHand.subtract(quantityReserved).subtract(quantityFrozen);
        if (quantityAvailable.signum() < 0) throw invalid("INVENTORY_BALANCE_NEGATIVE", "库存投影不能形成负可用量");
        projectedAt = Instant.now();
    }

    private BusinessException invalid(String code, String message) {
        return new BusinessException(code, message, HttpStatus.CONFLICT);
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long stockSiteId() { return stockSiteId; }
    public Long stockBinId() { return stockBinId; }
    public Long stockItemId() { return stockItemId; }
    public Long stockLotId() { return stockLotId; }
    public String stockStatus() { return stockStatus; }
    public String baseUnitCode() { return baseUnitCode; }
    public BigDecimal quantityOnHand() { return quantityOnHand; }
    public BigDecimal quantityReserved() { return quantityReserved; }
    public BigDecimal quantityFrozen() { return quantityFrozen; }
    public BigDecimal quantityAvailable() { return quantityAvailable; }
    public BigDecimal averageUnitCost() { return averageUnitCost; }
    public Instant projectedAt() { return projectedAt; }
}
