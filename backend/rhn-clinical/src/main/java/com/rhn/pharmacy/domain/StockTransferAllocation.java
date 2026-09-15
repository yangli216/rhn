package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_STOCK_XFER_ALLOC")
public class StockTransferAllocation {
    @Id @Column(name = "ID_STOCK_XFER_ALLOC") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_STOCK_XFER_LINE", nullable = false) private Long stockTransferLineId;
    @Column(name = "ID_STOCK_BIN_SRC", nullable = false) private Long sourceBinId;
    @Column(name = "ID_STOCK_BIN_DESTINATION") private Long destinationBinId;
    @Column(name = "ID_STOCK_LOT", nullable = false) private Long stockLotId;
    @Column(name = "SD_STOCK_STATUS", nullable = false) private String stockStatus;
    @Column(name = "QTY_DISPATCHED", nullable = false, precision = 28, scale = 8) private BigDecimal dispatchedQuantity;
    @Column(name = "QTY_RECEIVED", nullable = false, precision = 28, scale = 8) private BigDecimal receivedQuantity;
    @Column(name = "QTY_DAMAGED", nullable = false, precision = 28, scale = 8) private BigDecimal damagedQuantity;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    protected StockTransferAllocation() {}
    public StockTransferAllocation(Long tenantId, Long lineId, Long sourceBinId, Long stockLotId,
                                   String stockStatus, BigDecimal quantity, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.stockTransferLineId = lineId;
        this.sourceBinId = sourceBinId; this.stockLotId = stockLotId; this.stockStatus = stockStatus;
        this.dispatchedQuantity = quantity; this.receivedQuantity = BigDecimal.ZERO; this.damagedQuantity = BigDecimal.ZERO;
        this.status = "ALLOCATED"; this.createdAt = Instant.now(); this.createdBy = actorId;
    }
    public void markInTransit() { if (!"ALLOCATED".equals(status)) throw new IllegalStateException("调拨分配明细已处理"); status = "IN_TRANSIT"; }
    public void receive(Long destinationBinId, BigDecimal received, BigDecimal damaged) {
        if (!"IN_TRANSIT".equals(status) || received.add(damaged).compareTo(dispatchedQuantity) != 0) throw new IllegalStateException("调入数量与调出数量不一致");
        this.destinationBinId = destinationBinId; this.receivedQuantity = received; this.damagedQuantity = damaged;
        this.status = damaged.signum() > 0 ? "DISCREPANCY" : "RECEIVED";
    }
    public Long id() { return id; } public Long tenantId() { return tenantId; } public Long stockTransferLineId() { return stockTransferLineId; }
    public Long sourceBinId() { return sourceBinId; } public Long destinationBinId() { return destinationBinId; }
    public Long stockLotId() { return stockLotId; } public String stockStatus() { return stockStatus; }
    public BigDecimal dispatchedQuantity() { return dispatchedQuantity; } public BigDecimal receivedQuantity() { return receivedQuantity; }
    public BigDecimal damagedQuantity() { return damagedQuantity; } public String status() { return status; }
}
