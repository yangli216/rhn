package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "medication_dispense_lines")
public class MedicationDispenseLine {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "medication_dispense_id", nullable = false) private Long medicationDispenseId;
    @Column(name = "task_line_id", nullable = false) private Long taskLineId;
    @Column(name = "original_dispense_line_id") private Long originalDispenseLineId;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(name = "stock_bin_id", nullable = false) private Long stockBinId;
    @Column(name = "stock_item_id", nullable = false) private Long stockItemId;
    @Column(name = "stock_lot_id", nullable = false) private Long stockLotId;
    @Column(name = "inventory_transaction_line_id", nullable = false) private Long inventoryTransactionLineId;
    @Column(name = "quantity_dispensed", nullable = false, precision = 28, scale = 8) private BigDecimal quantityDispensed;
    @Column(name = "dispense_unit_code", nullable = false) private String dispenseUnitCode;
    @Column(name = "base_quantity_factor", nullable = false, precision = 28, scale = 8) private BigDecimal baseQuantityFactor;

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
