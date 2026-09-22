package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "RHN_SUP_STOCK_RETURN_LINE")
public class StockReturnLine {
    @Id @Column(name = "ID_STOCK_RETURN_LINE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_STOCK_RETURN", nullable = false) private Long stockReturnId;
    @Column(name = "ID_MED_DISP_LINE_ORIG", nullable = false) private Long originalDispenseLineId;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;
    @Column(name = "ID_STOCK_BIN", nullable = false) private Long stockBinId;
    @Column(name = "ID_STOCK_ITEM", nullable = false) private Long stockItemId;
    @Column(name = "ID_STOCK_LOT", nullable = false) private Long stockLotId;
    @Column(name = "ID_INV_TXN_LINE", nullable = false) private Long inventoryTransactionLineId;
    @Column(name = "QTY_REQD", nullable = false, precision = 28, scale = 8) private BigDecimal quantityRequested;
    @Column(name = "QTY_ACPTD", nullable = false, precision = 28, scale = 8) private BigDecimal quantityAccepted;
    @Column(name = "CD_RETURN_UNIT", nullable = false) private String returnUnitCode;
    @Column(name = "BASE_QTY_FACTOR", nullable = false, precision = 28, scale = 8) private BigDecimal baseQuantityFactor;
    @Column(name = "SD_DISPOS", nullable = false) private String disposition;
    @Column(name = "DES_EXCEPT_DESCR") private String exceptionDescription;

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
