package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;

/** Exact administration occurrence covered by a request-level supply line. */
@Entity
@Table(name = "RHN_SUP_INP_MED_SUPPLY_TASK")
public class InpatientMedicationSupplyTask {
    @Id @Column(name = "ID_INP_MED_SUPPLY_TASK") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_INP_MED_SUPPLY_LINE", nullable = false) private Long supplyLineId;
    @Column(name = "ID_CARE_REQ", nullable = false) private Long requestId;
    @Column(name = "ID_INP_ORDER_TASK", nullable = false) private Long orderTaskId;
    @Column(name = "DT_SCHEDULED", nullable = false) private Instant scheduledAt;
    @Column(name = "QTY_REQUIRED", nullable = false, precision = 28, scale = 8)
    private BigDecimal requiredQuantity;
    @Column(name = "CD_QUANTITY_UNIT", nullable = false) private String quantityUnitCode;
    @Column(name = "QTY_REQUIRED_BASE", nullable = false, precision = 28, scale = 8)
    private BigDecimal requiredBaseQuantity;
    @Column(name = "CD_BASE_UNIT", nullable = false) private String baseUnitCode;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "ACTIVE_SLOT") private Short activeSlot;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_CANCELLED") private Instant cancelledAt;
    @Column(name = "ID_USER_CANCELLED") private Long cancelledBy;
    @Column(name = "DES_CANCEL_REASON") private String cancelReason;

    protected InpatientMedicationSupplyTask() {
    }

    public InpatientMedicationSupplyTask(InpatientMedicationSupplyLine line, Long orderTaskId,
                                         Instant scheduledAt, BigDecimal requiredQuantity,
                                         String quantityUnitCode, BigDecimal requiredBaseQuantity,
                                         String baseUnitCode, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = line.tenantId();
        this.supplyLineId = line.id();
        this.requestId = line.requestId();
        this.orderTaskId = orderTaskId;
        this.scheduledAt = scheduledAt;
        this.requiredQuantity = requiredQuantity;
        this.quantityUnitCode = quantityUnitCode;
        this.requiredBaseQuantity = requiredBaseQuantity;
        this.baseUnitCode = baseUnitCode;
        this.status = "ACTIVE";
        this.activeSlot = 1;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
    }

    public void cancel(String reason, Long actorId) {
        if ("CANCELLED".equals(status)) return;
        this.status = "CANCELLED";
        this.activeSlot = null;
        this.cancelledAt = Instant.now();
        this.cancelledBy = actorId;
        this.cancelReason = reason;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long supplyLineId() { return supplyLineId; }
    public Long requestId() { return requestId; }
    public Long orderTaskId() { return orderTaskId; }
    public Instant scheduledAt() { return scheduledAt; }
    public BigDecimal requiredQuantity() { return requiredQuantity; }
    public String quantityUnitCode() { return quantityUnitCode; }
    public BigDecimal requiredBaseQuantity() { return requiredBaseQuantity; }
    public String baseUnitCode() { return baseUnitCode; }
    public String status() { return status; }
    public Short activeSlot() { return activeSlot; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public Instant cancelledAt() { return cancelledAt; }
    public Long cancelledBy() { return cancelledBy; }
    public String cancelReason() { return cancelReason; }
}
