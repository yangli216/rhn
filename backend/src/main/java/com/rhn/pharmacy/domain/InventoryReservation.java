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
@Table(name = "RHN_SUP_INV_RESV")
public class InventoryReservation {
    @Id @Column(name = "ID_INV_RESV") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_STOCK_SITE", nullable = false) private Long stockSiteId;
    @Column(name = "ID_STOCK_BIN", nullable = false) private Long stockBinId;
    @Column(name = "ID_STOCK_ITEM", nullable = false) private Long stockItemId;
    @Column(name = "ID_STOCK_LOT", nullable = false) private Long stockLotId;
    @Column(name = "ID_CARE_REQ", nullable = false) private Long requestId;
    @Column(name = "ID_DISP_TASK_LINE", nullable = false) private Long dispenseTaskLineId;
    @Column(name = "CD_RESV_GRP", nullable = false) private String reservationGroupCode;
    @Column(name = "SD_RESV_TYPE", nullable = false) private String reservationType;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "QTY_RESERVED", nullable = false, precision = 28, scale = 8) private BigDecimal quantityReserved;
    @Column(name = "QTY_CONSUMED", nullable = false, precision = 28, scale = 8) private BigDecimal quantityConsumed;
    @Column(name = "CD_BASE_UNIT", nullable = false) private String baseUnitCode;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_EXPIRES") private Instant expiresAt;
    @Column(name = "DT_CONSUMED") private Instant consumedAt;
    @Column(name = "ID_USER_CONSUMED") private Long consumedBy;
    @Column(name = "DT_RELEASED") private Instant releasedAt;
    @Column(name = "ID_USER_RELEASED") private Long releasedBy;
    @Column(name = "DES_RELEASE_REASON") private String releaseReason;

    protected InventoryReservation() {}

    public InventoryReservation(Long tenantId, Long stockSiteId, Long stockBinId, Long stockItemId,
                                Long stockLotId, Long requestId, Long dispenseTaskLineId,
                                String reservationGroupCode, BigDecimal quantityReserved,
                                String baseUnitCode, Long actorId, Instant expiresAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.stockSiteId = stockSiteId;
        this.stockBinId = stockBinId; this.stockItemId = stockItemId; this.stockLotId = stockLotId;
        this.requestId = requestId; this.dispenseTaskLineId = dispenseTaskLineId;
        this.reservationGroupCode = reservationGroupCode;
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
    public Long dispenseTaskLineId() { return dispenseTaskLineId; }
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
