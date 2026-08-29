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
@Table(name = "inventory_open_packages")
public class InventoryOpenPackage {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "stock_site_id", nullable = false) private Long stockSiteId;
    @Column(name = "stock_bin_id", nullable = false) private Long stockBinId;
    @Column(name = "stock_item_id", nullable = false) private Long stockItemId;
    @Column(name = "stock_lot_id", nullable = false) private Long stockLotId;
    @Column(name = "package_id", nullable = false) private Long packageId;
    @Column(name = "trace_code_id") private Long traceCodeId;
    @Column(name = "request_code", nullable = false) private String requestCode;
    @Column(name = "source_unit_code", nullable = false) private String sourceUnitCode;
    @Column(name = "base_unit_code", nullable = false) private String baseUnitCode;
    @Column(name = "package_factor", nullable = false, precision = 28, scale = 8) private BigDecimal packageFactor;
    @Column(name = "opened_base_quantity", nullable = false, precision = 28, scale = 8) private BigDecimal openedBaseQuantity;
    @Column(name = "remaining_base_quantity", nullable = false, precision = 28, scale = 8) private BigDecimal remainingBaseQuantity;
    @Column(nullable = false) private String status;
    @Column(name = "opened_at", nullable = false) private Instant openedAt;
    @Column(name = "opened_by", nullable = false) private Long openedBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;
    @Column(name = "closed_at") private Instant closedAt;

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
