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
import java.time.Instant;

@Entity
@Table(name = "inventory_reservations")
public class InventoryReservation {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "stock_site_id", nullable = false) private Long stockSiteId;
    @Column(name = "stock_bin_id", nullable = false) private Long stockBinId;
    @Column(name = "stock_item_id", nullable = false) private Long stockItemId;
    @Column(name = "stock_lot_id", nullable = false) private Long stockLotId;
    @Column(name = "request_id", nullable = false) private Long requestId;
    @Column(name = "reservation_group_code", nullable = false) private String reservationGroupCode;
    @Column(name = "reservation_type", nullable = false) private String reservationType;
    @Column(nullable = false) private String status;
    @Column(name = "quantity_reserved", nullable = false, precision = 28, scale = 8) private BigDecimal quantityReserved;
    @Column(name = "quantity_consumed", nullable = false, precision = 28, scale = 8) private BigDecimal quantityConsumed;
    @Column(name = "base_unit_code", nullable = false) private String baseUnitCode;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "expires_at") private Instant expiresAt;
    @Column(name = "consumed_at") private Instant consumedAt;
    @Column(name = "consumed_by") private Long consumedBy;
    @Column(name = "released_at") private Instant releasedAt;
    @Column(name = "released_by") private Long releasedBy;
    @Column(name = "release_reason") private String releaseReason;

    protected InventoryReservation() {}

    public InventoryReservation(Long tenantId, Long stockSiteId, Long stockBinId, Long stockItemId,
                                Long stockLotId, Long requestId, String reservationGroupCode,
                                BigDecimal quantityReserved, String baseUnitCode, Long actorId, Instant expiresAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.stockSiteId = stockSiteId;
        this.stockBinId = stockBinId; this.stockItemId = stockItemId; this.stockLotId = stockLotId;
        this.requestId = requestId; this.reservationGroupCode = reservationGroupCode;
        this.reservationType = "DISPENSE"; this.status = "ACTIVE";
        this.quantityReserved = quantityReserved; this.quantityConsumed = BigDecimal.ZERO;
        this.baseUnitCode = baseUnitCode; this.createdAt = Instant.now(); this.createdBy = actorId;
        this.expiresAt = expiresAt;
    }

    public void release(Long actorId, String reason) {
        if ("RELEASED".equals(status)) return;
        if (!"ACTIVE".equals(status) && !"PARTIAL".equals(status)) {
            throw new BusinessException("INVENTORY_RESERVATION_RELEASE_STATE_INVALID",
                    "当前预留状态不能释放", HttpStatus.CONFLICT);
        }
        status = "RELEASED"; releasedAt = Instant.now(); releasedBy = actorId; releaseReason = reason;
    }

    public void consume(BigDecimal quantity, Long actorId, Instant occurredAt) {
        if (!active() || quantity == null || quantity.signum() <= 0 || releasableQuantity().compareTo(quantity) < 0) {
            throw new BusinessException("INVENTORY_RESERVATION_CONSUME_INVALID",
                    "消费数量超过有效预留余量", HttpStatus.CONFLICT);
        }
        quantityConsumed = quantityConsumed.add(quantity); consumedAt = occurredAt; consumedBy = actorId;
        status = quantityConsumed.compareTo(quantityReserved) == 0 ? "CONSUMED" : "PARTIAL";
    }

    public void expire(Instant now) {
        if (!active()) return;
        if (expiresAt == null || expiresAt.isAfter(now)) {
            throw new BusinessException("INVENTORY_RESERVATION_NOT_DUE",
                    "库存预留尚未到期", HttpStatus.CONFLICT);
        }
        status = "EXPIRED"; releasedAt = now; releaseReason = "SYSTEM_EXPIRY";
    }

    public BigDecimal releasableQuantity() { return quantityReserved.subtract(quantityConsumed); }
    public boolean active() { return "ACTIVE".equals(status) || "PARTIAL".equals(status); }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long stockSiteId() { return stockSiteId; }
    public Long stockBinId() { return stockBinId; }
    public Long stockItemId() { return stockItemId; }
    public Long stockLotId() { return stockLotId; }
    public Long requestId() { return requestId; }
    public String reservationGroupCode() { return reservationGroupCode; }
    public String reservationType() { return reservationType; }
    public String status() { return status; }
    public BigDecimal quantityReserved() { return quantityReserved; }
    public BigDecimal quantityConsumed() { return quantityConsumed; }
    public String baseUnitCode() { return baseUnitCode; }
    public Instant createdAt() { return createdAt; }
    public Instant expiresAt() { return expiresAt; }
    public Instant releasedAt() { return releasedAt; }
    public Instant consumedAt() { return consumedAt; }
    public Long consumedBy() { return consumedBy; }
    public Long releasedBy() { return releasedBy; }
    public String releaseReason() { return releaseReason; }
}
