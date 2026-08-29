package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "stock_return_lines")
public class StockReturnLine {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "stock_return_id", nullable = false) private Long stockReturnId;
    @Column(name = "original_dispense_line_id", nullable = false) private Long originalDispenseLineId;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(name = "stock_bin_id", nullable = false) private Long stockBinId;
    @Column(name = "stock_item_id", nullable = false) private Long stockItemId;
    @Column(name = "stock_lot_id", nullable = false) private Long stockLotId;
    @Column(name = "inventory_transaction_line_id", nullable = false) private Long inventoryTransactionLineId;
    @Column(name = "quantity_requested", nullable = false, precision = 28, scale = 8) private BigDecimal quantityRequested;
    @Column(name = "quantity_accepted", nullable = false, precision = 28, scale = 8) private BigDecimal quantityAccepted;
    @Column(name = "return_unit_code", nullable = false) private String returnUnitCode;
    @Column(name = "base_quantity_factor", nullable = false, precision = 28, scale = 8) private BigDecimal baseQuantityFactor;
    @Column(nullable = false) private String disposition;
    @Column(name = "exception_description") private String exceptionDescription;

    protected StockReturnLine() {}

    public StockReturnLine(Long tenantId, Long stockReturnId, Long originalDispenseLineId, int sortOrder,
                           Long stockBinId, Long stockItemId, Long stockLotId, Long inventoryTransactionLineId,
                           BigDecimal quantity, String returnUnitCode, BigDecimal baseQuantityFactor,
                           String disposition, String exceptionDescription) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.stockReturnId = stockReturnId;
        this.originalDispenseLineId = originalDispenseLineId; this.sortOrder = sortOrder;
        this.stockBinId = stockBinId; this.stockItemId = stockItemId; this.stockLotId = stockLotId;
        this.inventoryTransactionLineId = inventoryTransactionLineId; this.quantityRequested = quantity;
        this.quantityAccepted = quantity; this.returnUnitCode = returnUnitCode;
        this.baseQuantityFactor = baseQuantityFactor; this.disposition = disposition;
        this.exceptionDescription = exceptionDescription;
    }

    public Long id() { return id; }
    public Long stockReturnId() { return stockReturnId; }
    public Long originalDispenseLineId() { return originalDispenseLineId; }
    public int sortOrder() { return sortOrder; }
    public Long stockBinId() { return stockBinId; }
    public Long stockItemId() { return stockItemId; }
    public Long stockLotId() { return stockLotId; }
    public Long inventoryTransactionLineId() { return inventoryTransactionLineId; }
    public BigDecimal quantityAccepted() { return quantityAccepted; }
    public String returnUnitCode() { return returnUnitCode; }
    public BigDecimal baseQuantityFactor() { return baseQuantityFactor; }
    public String disposition() { return disposition; }
    public String exceptionDescription() { return exceptionDescription; }
}
