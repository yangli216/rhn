package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_INV_OPEN_PKG")
public class InventoryOpenPackage {
    @Id @Column(name = "ID_INV_OPEN_PKG") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_STOCK_SITE", nullable = false) private Long stockSiteId;
    @Column(name = "ID_STOCK_BIN", nullable = false) private Long stockBinId;
    @Column(name = "ID_STOCK_ITEM", nullable = false) private Long stockItemId;
    @Column(name = "ID_STOCK_LOT", nullable = false) private Long stockLotId;
    @Column(name = "ID_ITEM_PKG", nullable = false) private Long packageId;
    @Column(name = "ID_INV_TRACE_CODE") private Long traceCodeId;
    @Column(name = "CD_REQ", nullable = false) private String requestCode;
    @Column(name = "CD_SRC_UNIT", nullable = false) private String sourceUnitCode;
    @Column(name = "CD_BASE_UNIT", nullable = false) private String baseUnitCode;
    @Column(name = "PACKAGE_FACTOR", nullable = false, precision = 28, scale = 8) private BigDecimal packageFactor;
    @Column(name = "QTY_OPENED_BASE", nullable = false, precision = 28, scale = 8) private BigDecimal openedBaseQuantity;
    @Column(name = "QTY_REMAINING_BASE", nullable = false, precision = 28, scale = 8) private BigDecimal remainingBaseQuantity;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_OPENED", nullable = false) private Instant openedAt;
    @Column(name = "ID_USER_OPENED", nullable = false) private Long openedBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;
    @Column(name = "DT_CLOSED") private Instant closedAt;

    protected InventoryOpenPackage() {}

    public InventoryOpenPackage(Long tenantId, Long organizationId, Long stockSiteId, Long stockBinId,
                                Long stockItemId, Long stockLotId, Long packageId, Long traceCodeId,
                                String requestCode, String sourceUnitCode, String baseUnitCode,
                                BigDecimal packageFactor, Long actorId, Instant occurredAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.stockSiteId = stockSiteId; this.stockBinId = stockBinId; this.stockItemId = stockItemId;
        this.stockLotId = stockLotId; this.packageId = packageId; this.traceCodeId = traceCodeId;
        this.requestCode = requestCode; this.sourceUnitCode = sourceUnitCode; this.baseUnitCode = baseUnitCode;
        this.packageFactor = packageFactor; this.openedBaseQuantity = packageFactor;
        this.remainingBaseQuantity = packageFactor; this.status = "OPEN";
        this.openedAt = occurredAt; this.openedBy = actorId; this.updatedAt = occurredAt; this.updatedBy = actorId;
    }

    public void consume(BigDecimal quantity, Long actorId, Instant occurredAt) {
        if (!"OPEN".equals(status) || quantity == null || quantity.signum() <= 0
                || remainingBaseQuantity.compareTo(quantity) < 0) {
            throw new IllegalStateException("拆零包装剩余量不足");
        }
        remainingBaseQuantity = remainingBaseQuantity.subtract(quantity);
        updatedAt = occurredAt; updatedBy = actorId;
        if (remainingBaseQuantity.signum() == 0) { status = "CONSUMED"; closedAt = occurredAt; }
    }

    public BigDecimal restorableQuantity() { return openedBaseQuantity.subtract(remainingBaseQuantity); }

    public void restore(BigDecimal quantity, Long actorId, Instant occurredAt) {
        if (quantity == null || quantity.signum() <= 0 || restorableQuantity().compareTo(quantity) < 0) {
            throw new IllegalStateException("拆零包装可恢复数量不足");
        }
        remainingBaseQuantity = remainingBaseQuantity.add(quantity); status = "OPEN"; closedAt = null;
        updatedAt = occurredAt; updatedBy = actorId;
    }

    public Long id() { return id; } public long revision() { return revision; }
    public Long tenantId() { return tenantId; } public Long organizationId() { return organizationId; }
    public Long stockSiteId() { return stockSiteId; } public Long stockBinId() { return stockBinId; }
    public Long stockItemId() { return stockItemId; } public Long stockLotId() { return stockLotId; }
    public Long packageId() { return packageId; } public Long traceCodeId() { return traceCodeId; }
    public String requestCode() { return requestCode; } public String sourceUnitCode() { return sourceUnitCode; }
    public String baseUnitCode() { return baseUnitCode; } public BigDecimal packageFactor() { return packageFactor; }
    public BigDecimal openedBaseQuantity() { return openedBaseQuantity; }
    public BigDecimal remainingBaseQuantity() { return remainingBaseQuantity; } public String status() { return status; }
    public Instant openedAt() { return openedAt; } public Long openedBy() { return openedBy; }
    public Instant updatedAt() { return updatedAt; } public Long updatedBy() { return updatedBy; }
    public Instant closedAt() { return closedAt; }
}
