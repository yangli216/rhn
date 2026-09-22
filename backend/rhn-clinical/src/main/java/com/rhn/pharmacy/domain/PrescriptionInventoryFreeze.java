package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_RX_INV_FREEZE")
public class PrescriptionInventoryFreeze {
    @Id @Column(name = "ID_RX_INV_FREEZE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_RX", nullable = false) private Long prescriptionId;
    @Column(name = "ID_CARE_REQ", nullable = false) private Long requestId;
    @Column(name = "ID_STOCK_SITE", nullable = false) private Long stockSiteId;
    @Column(name = "ID_STOCK_BIN", nullable = false) private Long stockBinId;
    @Column(name = "ID_STOCK_ITEM", nullable = false) private Long stockItemId;
    @Column(name = "ID_STOCK_LOT", nullable = false) private Long stockLotId;
    @Column(name = "QTY_FROZEN", nullable = false, precision = 28, scale = 8) private BigDecimal quantityFrozen;
    @Column(name = "CD_BASE_UNIT", nullable = false) private String baseUnitCode;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_RLSD") private Instant releasedAt;
    @Column(name = "ID_USER_RLSD") private Long releasedBy;
    @Column(name = "DES_RELEASE_REASON") private String releaseReason;

    protected PrescriptionInventoryFreeze() {}

    public PrescriptionInventoryFreeze(Long tenantId, Long prescriptionId, Long requestId,
                                       Long stockSiteId, Long stockBinId, Long stockItemId,
                                       Long stockLotId, BigDecimal quantityFrozen,
                                       String baseUnitCode, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.prescriptionId = prescriptionId;
        this.requestId = requestId;
        this.stockSiteId = stockSiteId;
        this.stockBinId = stockBinId;
        this.stockItemId = stockItemId;
        this.stockLotId = stockLotId;
        this.quantityFrozen = quantityFrozen;
        this.baseUnitCode = baseUnitCode;
        this.status = "ACTIVE";
        this.createdAt = Instant.now();
        this.createdBy = actorId;
    }

    public void release(Long actorId, String reason) {
        if ("RELEASED".equals(status)) return;
        this.status = "RELEASED";
        this.releasedAt = Instant.now();
        this.releasedBy = actorId;
        this.releaseReason = reason;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long prescriptionId() { return prescriptionId; }
    public Long requestId() { return requestId; }
    public Long stockSiteId() { return stockSiteId; }
    public Long stockBinId() { return stockBinId; }
    public Long stockItemId() { return stockItemId; }
    public Long stockLotId() { return stockLotId; }
    public BigDecimal quantityFrozen() { return quantityFrozen; }
    public String baseUnitCode() { return baseUnitCode; }
    public String status() { return status; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public Instant releasedAt() { return releasedAt; }
    public Long releasedBy() { return releasedBy; }
    public String releaseReason() { return releaseReason; }
}
