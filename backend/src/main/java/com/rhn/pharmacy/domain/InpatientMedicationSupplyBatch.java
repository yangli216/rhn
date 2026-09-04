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
@Table(name = "RHN_SUP_INP_MED_SUPPLY_BATCH")
public class InpatientMedicationSupplyBatch {
    @Id @Column(name = "ID_INP_MED_SUPPLY_BATCH") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_STOCK_SITE", nullable = false) private Long stockSiteId;
    @Column(name = "ID_DEPT_NURS_UNIT", nullable = false) private Long nursingUnitDepartmentId;
    @Column(name = "ID_DISP_ROUTE") private Long dispenseRouteId;
    @Column(name = "SN_DISP_ROUTE_VER") private Long dispenseRouteRevision;
    @Column(name = "SD_MED_TYPE_SNAP") private String routingDimension;
    @Column(name = "CD_BATCH_NO", nullable = false) private String batchNo;
    @Column(name = "SD_BATCH_TYPE", nullable = false) private String batchType;
    @Column(name = "SD_SUPPLY_MODE", nullable = false) private String supplyMode;
    @Column(name = "DT_WINDOW_START", nullable = false) private Instant windowStart;
    @Column(name = "DT_WINDOW_END", nullable = false) private Instant windowEnd;
    @Column(name = "DT_CUTOFF", nullable = false) private Instant cutoffAt;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "CD_GEN_COMMAND", nullable = false) private String generationCommandCode;
    @Column(name = "HASH_GEN_PAYLOAD", nullable = false) private String generationPayloadHash;
    @Column(name = "SD_GEN_TRIGGER", nullable = false) private String generationTrigger;
    @Column(name = "CD_SUBMIT_COMMAND") private String submitCommandCode;
    @Column(name = "HASH_SUBMIT_PAYLOAD") private String submitPayloadHash;
    @Column(name = "CD_CANCEL_COMMAND") private String cancelCommandCode;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_SUBMITTED") private Instant submittedAt;
    @Column(name = "ID_USER_SUBMITTED") private Long submittedBy;
    @Column(name = "DT_CANCELLED") private Instant cancelledAt;
    @Column(name = "ID_USER_CANCELLED") private Long cancelledBy;
    @Column(name = "DES_CANCEL_REASON") private String cancelReason;
    @Column(name = "DT_CLOSED") private Instant closedAt;
    @Column(name = "ID_USER_CLOSED") private Long closedBy;

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
