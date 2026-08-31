package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

import static com.rhn.shared.api.BusinessErrors.conflict;

/** A ward-to-pharmacy supply window; it never replaces clinical orders or dispense facts. */
@Entity
@Table(name = "inpatient_med_supply_batches")
public class InpatientMedicationSupplyBatch {
    @Id private Long id;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "stock_site_id", nullable = false) private Long stockSiteId;
    @Column(name = "nursing_unit_department_id", nullable = false) private Long nursingUnitDepartmentId;
    @Column(name = "dispense_route_id") private Long dispenseRouteId;
    @Column(name = "dispense_route_revision") private Long dispenseRouteRevision;
    @Column(name = "medication_type_snapshot") private String routingDimension;
    @Column(name = "batch_no", nullable = false) private String batchNo;
    @Column(name = "batch_type", nullable = false) private String batchType;
    @Column(name = "supply_mode", nullable = false) private String supplyMode;
    @Column(name = "window_start", nullable = false) private Instant windowStart;
    @Column(name = "window_end", nullable = false) private Instant windowEnd;
    @Column(name = "cutoff_at", nullable = false) private Instant cutoffAt;
    @Column(nullable = false) private String status;
    @Column(name = "generation_command_code", nullable = false) private String generationCommandCode;
    @Column(name = "generation_payload_hash", nullable = false) private String generationPayloadHash;
    @Column(name = "generation_trigger", nullable = false) private String generationTrigger;
    @Column(name = "submit_command_code") private String submitCommandCode;
    @Column(name = "submit_payload_hash") private String submitPayloadHash;
    @Column(name = "cancel_command_code") private String cancelCommandCode;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by") private Long createdBy;
    @Column(name = "submitted_at") private Instant submittedAt;
    @Column(name = "submitted_by") private Long submittedBy;
    @Column(name = "cancelled_at") private Instant cancelledAt;
    @Column(name = "cancelled_by") private Long cancelledBy;
    @Column(name = "cancel_reason") private String cancelReason;
    @Column(name = "closed_at") private Instant closedAt;
    @Column(name = "closed_by") private Long closedBy;

    protected InpatientMedicationSupplyBatch() {
    }

    public InpatientMedicationSupplyBatch(Long tenantId, Long organizationId, Long stockSiteId,
                                          Long nursingUnitDepartmentId, String batchNo, String batchType,
                                          String supplyMode, Instant windowStart, Instant windowEnd,
                                          Instant cutoffAt, String generationCommandCode,
                                          String generationPayloadHash, String generationTrigger, Long actorId) {
        this(tenantId, organizationId, stockSiteId, nursingUnitDepartmentId, batchNo, batchType,
                supplyMode, windowStart, windowEnd, cutoffAt, generationCommandCode,
                generationPayloadHash, generationTrigger, actorId, null, null, null);
    }

    public InpatientMedicationSupplyBatch(Long tenantId, Long organizationId, Long stockSiteId,
                                          Long nursingUnitDepartmentId, String batchNo, String batchType,
                                          String supplyMode, Instant windowStart, Instant windowEnd,
                                          Instant cutoffAt, String generationCommandCode,
                                          String generationPayloadHash, String generationTrigger, Long actorId,
                                          Long dispenseRouteId, Long dispenseRouteRevision,
                                          String routingDimension) {
        if (windowStart == null || windowEnd == null || !windowEnd.isAfter(windowStart)) {
            throw new IllegalArgumentException("Supply window end must be after start");
        }
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.organizationId = organizationId;
        this.stockSiteId = stockSiteId;
        this.nursingUnitDepartmentId = nursingUnitDepartmentId;
        this.dispenseRouteId = dispenseRouteId;
        this.dispenseRouteRevision = dispenseRouteRevision;
        this.routingDimension = routingDimension;
        this.batchNo = batchNo;
        this.batchType = batchType;
        this.supplyMode = supplyMode;
        this.windowStart = windowStart;
        this.windowEnd = windowEnd;
        this.cutoffAt = cutoffAt;
        this.status = "DRAFT";
        this.generationCommandCode = generationCommandCode;
        this.generationPayloadHash = generationPayloadHash;
        this.generationTrigger = generationTrigger;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
    }

    public void submit(long expectedRevision, String commandCode, String payloadHash, Long actorId) {
        requireRevision(expectedRevision);
        requireStatus("DRAFT", "INPATIENT_SUPPLY_BATCH_NOT_DRAFT", "只有草稿供药批次可以提交");
        this.status = "SUBMITTED";
        this.submitCommandCode = commandCode;
        this.submitPayloadHash = payloadHash;
        this.submittedAt = Instant.now();
        this.submittedBy = actorId;
    }

    public void cancel(long expectedRevision, String commandCode, String reason, Long actorId) {
        requireRevision(expectedRevision);
        if (!"DRAFT".equals(status) && !"SUBMITTED".equals(status)) {
            throw conflict("INPATIENT_SUPPLY_BATCH_NOT_CANCELLABLE", "当前供药批次不能取消");
        }
        this.status = "CANCELLED";
        this.cancelCommandCode = commandCode;
        this.cancelReason = reason;
        this.cancelledAt = Instant.now();
        this.cancelledBy = actorId;
    }

    public void close(long expectedRevision, Long actorId) {
        requireRevision(expectedRevision);
        requireStatus("SUBMITTED", "INPATIENT_SUPPLY_BATCH_NOT_SUBMITTED", "只有已提交供药批次可以关闭");
        this.status = "CLOSED";
        this.closedAt = Instant.now();
        this.closedBy = actorId;
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) {
            throw conflict("INPATIENT_SUPPLY_BATCH_REVISION_CONFLICT", "供药批次已被其他用户更新，请刷新后重试");
        }
    }

    private void requireStatus(String expected, String code, String message) {
        if (!expected.equals(status)) throw conflict(code, message);
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long stockSiteId() { return stockSiteId; }
    public Long nursingUnitDepartmentId() { return nursingUnitDepartmentId; }
    public Long dispenseRouteId() { return dispenseRouteId; }
    public Long dispenseRouteRevision() { return dispenseRouteRevision; }
    public String routingDimension() { return routingDimension; }
    public String batchNo() { return batchNo; }
    public String batchType() { return batchType; }
    public String supplyMode() { return supplyMode; }
    public Instant windowStart() { return windowStart; }
    public Instant windowEnd() { return windowEnd; }
    public Instant cutoffAt() { return cutoffAt; }
    public String status() { return status; }
    public String generationCommandCode() { return generationCommandCode; }
    public String generationPayloadHash() { return generationPayloadHash; }
    public String generationTrigger() { return generationTrigger; }
    public String submitCommandCode() { return submitCommandCode; }
    public String submitPayloadHash() { return submitPayloadHash; }
    public String cancelCommandCode() { return cancelCommandCode; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public Instant submittedAt() { return submittedAt; }
    public Long submittedBy() { return submittedBy; }
    public Instant cancelledAt() { return cancelledAt; }
    public Long cancelledBy() { return cancelledBy; }
    public String cancelReason() { return cancelReason; }
    public Instant closedAt() { return closedAt; }
    public Long closedBy() { return closedBy; }
}
