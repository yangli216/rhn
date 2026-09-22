package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_DISP_TASK_LINE")
public class DispenseTaskLine {
    @Id @Column(name = "ID_DISP_TASK_LINE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_DISP_TASK", nullable = false) private Long taskId;
    @Column(name = "ID_CARE_REQ", nullable = false) private Long requestId;
    @Column(name = "SD_FULFILL_SRC_TYPE", nullable = false) private String fulfillmentSourceType;
    @Column(name = "ID_FULFILL_SRC", nullable = false) private Long fulfillmentSourceId;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;
    @Column(name = "ID_STOCK_ITEM", nullable = false) private Long stockItemId;
    @Column(name = "ID_ITEM_PKG", nullable = false) private Long packageId;
    @Column(name = "QTY_REQD", nullable = false, precision = 28, scale = 8) private BigDecimal requestedQuantity;
    @Column(name = "QTY_PLANNED", nullable = false, precision = 28, scale = 8) private BigDecimal plannedQuantity;
    @Column(name = "QTY_DSPNSD", nullable = false, precision = 28, scale = 8) private BigDecimal dispensedQuantity;
    @Column(name = "QTY_RETD", nullable = false, precision = 28, scale = 8) private BigDecimal returnedQuantity;
    @Column(name = "CD_DISP_UNIT", nullable = false) private String dispenseUnitCode;
    @Column(name = "BASE_QTY_FACTOR", nullable = false, precision = 28, scale = 8) private BigDecimal baseQuantityFactor;
    @Column(name = "FG_SPLIT", nullable = false) private boolean split;
    @Column(name = "FG_TRACE_RQD", nullable = false) private boolean traceRequired;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "CD_PRODUCT_SNAP", nullable = false) private String productCodeSnapshot;
    @Column(name = "NA_PRODUCT_SNAP", nullable = false) private String productNameSnapshot;
    @Column(name = "PACKAGE_SPEC_SNAP") private String packageSpecSnapshot;
    @Lob @Column(name = "JSON_ITEM_ATTR_SNAP", nullable = false) private String itemAttributeSnapshot;
    @Column(name = "HASH_ITEM_ATTR", nullable = false) private String itemAttributeHash;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;

    protected DispenseTaskLine() {}

    public DispenseTaskLine(Long tenantId, Long taskId, Long requestId, Long stockItemId, Long packageId,
                            BigDecimal requestedQuantity, BigDecimal plannedQuantity, String dispenseUnitCode,
                            BigDecimal baseQuantityFactor, boolean split, boolean traceRequired,
                            String productCodeSnapshot, String productNameSnapshot, String packageSpecSnapshot,
                            String itemAttributeSnapshot, String itemAttributeHash, Long actorId) {
        this(tenantId, taskId, requestId, "MEDICATION_REQUEST", requestId, stockItemId, packageId,
                requestedQuantity, plannedQuantity, dispenseUnitCode, baseQuantityFactor, split, traceRequired,
                productCodeSnapshot, productNameSnapshot, packageSpecSnapshot, itemAttributeSnapshot,
                itemAttributeHash, actorId);
    }

    public DispenseTaskLine(Long tenantId, Long taskId, Long requestId,
                            String fulfillmentSourceType, Long fulfillmentSourceId,
                            Long stockItemId, Long packageId,
                            BigDecimal requestedQuantity, BigDecimal plannedQuantity, String dispenseUnitCode,
                            BigDecimal baseQuantityFactor, boolean split, boolean traceRequired,
                            String productCodeSnapshot, String productNameSnapshot, String packageSpecSnapshot,
                            String itemAttributeSnapshot, String itemAttributeHash, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.taskId = taskId; this.requestId = requestId;
        this.fulfillmentSourceType = fulfillmentSourceType; this.fulfillmentSourceId = fulfillmentSourceId;
        this.sortOrder = 1; this.stockItemId = stockItemId; this.packageId = packageId;
        this.requestedQuantity = requestedQuantity; this.plannedQuantity = plannedQuantity;
        this.dispensedQuantity = BigDecimal.ZERO; this.returnedQuantity = BigDecimal.ZERO;
        this.dispenseUnitCode = dispenseUnitCode; this.baseQuantityFactor = baseQuantityFactor;
        this.split = split; this.traceRequired = traceRequired; this.status = "PENDING";
        this.productCodeSnapshot = productCodeSnapshot; this.productNameSnapshot = productNameSnapshot;
        this.packageSpecSnapshot = packageSpecSnapshot; this.itemAttributeSnapshot = itemAttributeSnapshot;
        this.itemAttributeHash = itemAttributeHash; this.createdAt = Instant.now(); this.createdBy = actorId;
    }

    public void applyReview(String result) {
        status = switch (result) {
            case "PASS", "OVERRIDE" -> "READY";
            case "REJECT" -> "CANCELLED";
            case "INTERVENE" -> "PENDING";
            default -> throw new IllegalArgumentException("Unsupported review result");
        };
    }

    public void bypassPreDispenseReview() {
        if (!"PENDING".equals(status)) {
            throw new IllegalStateException("Current dispense line cannot skip pre-dispense review");
        }
        status = "READY";
    }

    public void markReserved() {
        if (!"READY".equals(status)) {
            throw new IllegalStateException("Only ready dispense line can reserve inventory");
        }
        status = "PICKING";
    }

    public void releaseReservation() {
        if ("READY".equals(status)) return;
        if ("PARTIAL".equals(status)) {
            status = "READY";
            return;
        }
        if (!"PICKING".equals(status)) {
            throw new IllegalStateException("Current dispense line cannot release reservation");
        }
        status = "READY";
    }

    public void completePicking() {
        if (!"PICKING".equals(status)) throw new IllegalStateException("Only picking line can complete preparation");
        status = "READY_TO_DISPENSE";
    }

    public void recordDispense(BigDecimal quantity) {
        if (!"READY_TO_DISPENSE".equals(status) && !"PARTIAL".equals(status)) {
            throw new IllegalStateException("Current dispense line is not ready to dispense");
        }
        BigDecimal next = dispensedQuantity.add(quantity);
        if (quantity.signum() <= 0 || next.compareTo(plannedQuantity) > 0) {
            throw new IllegalArgumentException("Dispensed quantity exceeds planned quantity");
        }
        dispensedQuantity = next;
        status = dispensedQuantity.compareTo(plannedQuantity) == 0 ? "COMPLETED" : "PARTIAL";
    }

    /** Cancels only the unissued remainder; cumulative issue and return quantities remain immutable facts. */
    public void cancelRemainingForOrderStop() {
        if (remainingQuantity().signum() > 0) status = "CANCELLED";
    }

    public void recordReturn(BigDecimal quantity) {
        BigDecimal next = returnedQuantity.add(quantity);
        if (quantity.signum() <= 0 || next.compareTo(dispensedQuantity) > 0) {
            throw new IllegalArgumentException("Returned quantity exceeds dispensed quantity");
        }
        returnedQuantity = next;
        status = returnedQuantity.compareTo(dispensedQuantity) == 0 ? "RETURNED" : "PARTIAL";
    }

    public BigDecimal remainingQuantity() { return plannedQuantity.subtract(dispensedQuantity); }
    public BigDecimal netDispensedQuantity() { return dispensedQuantity.subtract(returnedQuantity); }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long taskId() { return taskId; }
    public Long requestId() { return requestId; }
    public String fulfillmentSourceType() { return fulfillmentSourceType; }
    public Long fulfillmentSourceId() { return fulfillmentSourceId; }
    public Long stockItemId() { return stockItemId; }
    public Long packageId() { return packageId; }
    public BigDecimal requestedQuantity() { return requestedQuantity; }
    public BigDecimal plannedQuantity() { return plannedQuantity; }
    public BigDecimal dispensedQuantity() { return dispensedQuantity; }
    public BigDecimal returnedQuantity() { return returnedQuantity; }
    public String dispenseUnitCode() { return dispenseUnitCode; }
    public BigDecimal baseQuantityFactor() { return baseQuantityFactor; }
    public boolean split() { return split; }
    public boolean traceRequired() { return traceRequired; }
    public String status() { return status; }
    public String productCodeSnapshot() { return productCodeSnapshot; }
    public String productNameSnapshot() { return productNameSnapshot; }
    public String packageSpecSnapshot() { return packageSpecSnapshot; }
    public String itemAttributeSnapshot() { return itemAttributeSnapshot; }
    public String itemAttributeHash() { return itemAttributeHash; }
}
