package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "RHN_SUP_MED_DISP_LINE")
public class MedicationDispenseLine {
    @Id @Column(name = "ID_MED_DISP_LINE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_MED_DISP", nullable = false) private Long medicationDispenseId;
    @Column(name = "ID_DISP_TASK_LINE", nullable = false) private Long taskLineId;
    @Column(name = "ID_MED_DISP_LINE_ORIG") private Long originalDispenseLineId;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;
    @Column(name = "ID_STOCK_BIN", nullable = false) private Long stockBinId;
    @Column(name = "ID_STOCK_ITEM", nullable = false) private Long stockItemId;
    @Column(name = "ID_STOCK_LOT", nullable = false) private Long stockLotId;
    @Column(name = "ID_INV_TXN_LINE", nullable = false) private Long inventoryTransactionLineId;
    @Column(name = "QTY_DSPNSD", nullable = false, precision = 28, scale = 8) private BigDecimal quantityDispensed;
    @Column(name = "CD_DISP_UNIT", nullable = false) private String dispenseUnitCode;
    @Column(name = "BASE_QTY_FACTOR", nullable = false, precision = 28, scale = 8) private BigDecimal baseQuantityFactor;

    protected MedicationDispenseLine() {}

    public MedicationDispenseLine(Long tenantId, Long medicationDispenseId, Long taskLineId,
                                  Long originalDispenseLineId, int sortOrder, Long stockBinId, Long stockItemId,
                                  Long stockLotId, Long inventoryTransactionLineId, BigDecimal quantityDispensed,
                                  String dispenseUnitCode, BigDecimal baseQuantityFactor) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.medicationDispenseId = medicationDispenseId;
        this.taskLineId = taskLineId; this.originalDispenseLineId = originalDispenseLineId;
        this.sortOrder = sortOrder; this.stockBinId = stockBinId; this.stockItemId = stockItemId;
        this.stockLotId = stockLotId; this.inventoryTransactionLineId = inventoryTransactionLineId;
        this.quantityDispensed = quantityDispensed; this.dispenseUnitCode = dispenseUnitCode;
        this.baseQuantityFactor = baseQuantityFactor;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long medicationDispenseId() { return medicationDispenseId; }
    public Long taskLineId() { return taskLineId; }
    public Long originalDispenseLineId() { return originalDispenseLineId; }
    public int sortOrder() { return sortOrder; }
    public Long stockBinId() { return stockBinId; }
    public Long stockItemId() { return stockItemId; }
    public Long stockLotId() { return stockLotId; }
    public Long inventoryTransactionLineId() { return inventoryTransactionLineId; }
    public BigDecimal quantityDispensed() { return quantityDispensed; }
    public String dispenseUnitCode() { return dispenseUnitCode; }
    public BigDecimal baseQuantityFactor() { return baseQuantityFactor; }
}
