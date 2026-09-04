package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;

import static com.rhn.shared.api.BusinessErrors.conflict;

/** Request-level total inside one rolling supply window. */
@Entity
@Table(name = "RHN_SUP_INP_MED_SUPPLY_LINE")
public class InpatientMedicationSupplyLine {
    @Id @Column(name = "ID_INP_MED_SUPPLY_LINE") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_INP_MED_SUPPLY_BATCH", nullable = false) private Long supplyBatchId;
    @Column(name = "ID_CARE_REQ", nullable = false) private Long requestId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "CD_BED_SNAP", nullable = false) private String bedNoSnapshot;
    @Column(name = "NA_PAT_SNAP", nullable = false) private String residentNameSnapshot;
    @Column(name = "CD_MED_SNAP", nullable = false) private String medicationCodeSnapshot;
    @Column(name = "NA_MED_SNAP", nullable = false) private String medicationNameSnapshot;
    @Column(name = "QTY_REQUESTED", nullable = false, precision = 28, scale = 8)
    private BigDecimal requestedQuantity;
    @Column(name = "CD_QUANTITY_UNIT", nullable = false) private String quantityUnitCode;
    @Column(name = "QTY_REQUESTED_BASE", nullable = false, precision = 28, scale = 8)
    private BigDecimal requestedBaseQuantity;
    @Column(name = "CD_BASE_UNIT", nullable = false) private String baseUnitCode;
    @Column(name = "QTY_OCCURRENCE", nullable = false) private int occurrenceCount;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "ID_DISP_TASK_LINE") private Long dispenseTaskLineId;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_SUBMITTED") private Instant submittedAt;
    @Column(name = "ID_USER_SUBMITTED") private Long submittedBy;
    @Column(name = "DT_TAKEN") private Instant takenAt;
    @Column(name = "ID_USER_TAKEN") private Long takenBy;
    @Column(name = "DT_CANCELLED") private Instant cancelledAt;
    @Column(name = "ID_USER_CANCELLED") private Long cancelledBy;
    @Column(name = "DES_CANCEL_REASON") private String cancelReason;

    protected InpatientMedicationSupplyLine() {
    }

    public InpatientMedicationSupplyLine(InpatientMedicationSupplyBatch batch, Long requestId,
                                         Long encounterId, Long residentId, String bedNoSnapshot,
                                         String residentNameSnapshot, String medicationCodeSnapshot,
                                         String medicationNameSnapshot, BigDecimal requestedQuantity,
                                         String quantityUnitCode, BigDecimal requestedBaseQuantity,
                                         String baseUnitCode, int occurrenceCount, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = batch.tenantId();
        this.supplyBatchId = batch.id();
        this.requestId = requestId;
        this.encounterId = encounterId;
        this.residentId = residentId;
        this.bedNoSnapshot = bedNoSnapshot;
        this.residentNameSnapshot = residentNameSnapshot;
        this.medicationCodeSnapshot = medicationCodeSnapshot;
        this.medicationNameSnapshot = medicationNameSnapshot;
        this.requestedQuantity = requestedQuantity;
        this.quantityUnitCode = quantityUnitCode;
        this.requestedBaseQuantity = requestedBaseQuantity;
        this.baseUnitCode = baseUnitCode;
        this.occurrenceCount = occurrenceCount;
        this.status = "DRAFT";
        this.createdAt = Instant.now();
        this.createdBy = actorId;
    }

    public void submit(long expectedRevision, Long actorId) {
        requireRevision(expectedRevision);
        requireStatus("DRAFT", "INPATIENT_SUPPLY_LINE_NOT_DRAFT", "只有草稿供药明细可以提交");
        this.status = "SUBMITTED";
        this.submittedAt = Instant.now();
        this.submittedBy = actorId;
    }

    public void recordIntake(long expectedRevision, Long dispenseTaskLineId, Long actorId) {
        requireRevision(expectedRevision);
        requireStatus("SUBMITTED", "INPATIENT_SUPPLY_LINE_NOT_SUBMITTED", "只有已提交供药明细可以接方");
        this.status = "INTAKEN";
        this.dispenseTaskLineId = dispenseTaskLineId;
        this.takenAt = Instant.now();
        this.takenBy = actorId;
    }

    public void cancel(long expectedRevision, String reason, Long actorId) {
        requireRevision(expectedRevision);
        if (!"DRAFT".equals(status) && !"SUBMITTED".equals(status)) {
            throw conflict("INPATIENT_SUPPLY_LINE_NOT_CANCELLABLE", "已接方供药明细不能直接取消");
        }
        this.status = "CANCELLED";
        this.cancelledAt = Instant.now();
        this.cancelledBy = actorId;
        this.cancelReason = reason;
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) {
            throw conflict("INPATIENT_SUPPLY_LINE_REVISION_CONFLICT", "供药明细已被其他用户更新，请刷新后重试");
        }
    }

    private void requireStatus(String expected, String code, String message) {
        if (!expected.equals(status)) throw conflict(code, message);
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long supplyBatchId() { return supplyBatchId; }
    public Long requestId() { return requestId; }
    public Long encounterId() { return encounterId; }
    public Long residentId() { return residentId; }
    public String bedNoSnapshot() { return bedNoSnapshot; }
    public String residentNameSnapshot() { return residentNameSnapshot; }
    public String medicationCodeSnapshot() { return medicationCodeSnapshot; }
    public String medicationNameSnapshot() { return medicationNameSnapshot; }
    public BigDecimal requestedQuantity() { return requestedQuantity; }
    public String quantityUnitCode() { return quantityUnitCode; }
    public BigDecimal requestedBaseQuantity() { return requestedBaseQuantity; }
    public String baseUnitCode() { return baseUnitCode; }
    public int occurrenceCount() { return occurrenceCount; }
    public String status() { return status; }
    public Long dispenseTaskLineId() { return dispenseTaskLineId; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public Instant submittedAt() { return submittedAt; }
    public Long submittedBy() { return submittedBy; }
    public Instant takenAt() { return takenAt; }
    public Long takenBy() { return takenBy; }
    public Instant cancelledAt() { return cancelledAt; }
    public Long cancelledBy() { return cancelledBy; }
    public String cancelReason() { return cancelReason; }
}
