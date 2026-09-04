package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_STOCK_REQ_ALLOC")
public class StockRequisitionAllocation {
    @Id @Column(name = "ID_STOCK_REQ_ALLOC") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_STOCK_REQ_LINE", nullable = false) private Long stockRequisitionLineId;
    @Column(name = "ID_STOCK_BIN", nullable = false) private Long stockBinId;
    @Column(name = "ID_STOCK_LOT", nullable = false) private Long stockLotId;
    @Column(name = "SD_STOCK_STATUS", nullable = false) private String stockStatus;
    @Column(name = "QTY_ALLOCATED", nullable = false, precision = 28, scale = 8) private BigDecimal allocatedQuantity;
    @Column(name = "QTY_ISSUED", nullable = false, precision = 28, scale = 8) private BigDecimal issuedQuantity;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;

    protected StockRequisitionAllocation() {}
    public StockRequisitionAllocation(Long tenantId, Long lineId, Long binId, Long lotId, String stockStatus,
                                      BigDecimal allocatedQuantity, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.stockRequisitionLineId = lineId;
        this.stockBinId = binId; this.stockLotId = lotId; this.stockStatus = stockStatus;
        this.allocatedQuantity = allocatedQuantity; this.issuedQuantity = BigDecimal.ZERO;
        this.status = "ALLOCATED"; this.createdAt = Instant.now(); this.createdBy = actorId;
    }
    public void markIssued() {
        if (!"ALLOCATED".equals(status)) throw new IllegalStateException("请领分配明细已处理");
        issuedQuantity = allocatedQuantity; status = "ISSUED";
    }
    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long stockRequisitionLineId() { return stockRequisitionLineId; }
    public Long stockBinId() { return stockBinId; }
    public Long stockLotId() { return stockLotId; }
    public String stockStatus() { return stockStatus; }
    public BigDecimal allocatedQuantity() { return allocatedQuantity; }
    public BigDecimal issuedQuantity() { return issuedQuantity; }
    public String status() { return status; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
}
