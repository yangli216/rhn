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
@Table(name = "inpatient_med_supply_lines")
public class InpatientMedicationSupplyLine {
    @Id private Long id;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "supply_batch_id", nullable = false) private Long supplyBatchId;
    @Column(name = "request_id", nullable = false) private Long requestId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "bed_no_snapshot", nullable = false) private String bedNoSnapshot;
    @Column(name = "resident_name_snapshot", nullable = false) private String residentNameSnapshot;
    @Column(name = "medication_code_snapshot", nullable = false) private String medicationCodeSnapshot;
    @Column(name = "medication_name_snapshot", nullable = false) private String medicationNameSnapshot;
    @Column(name = "requested_quantity", nullable = false, precision = 28, scale = 8)
    private BigDecimal requestedQuantity;
    @Column(name = "quantity_unit_code", nullable = false) private String quantityUnitCode;
    @Column(name = "requested_base_quantity", nullable = false, precision = 28, scale = 8)
    private BigDecimal requestedBaseQuantity;
    @Column(name = "base_unit_code", nullable = false) private String baseUnitCode;
    @Column(name = "occurrence_count", nullable = false) private int occurrenceCount;
    @Column(nullable = false) private String status;
    @Column(name = "dispense_task_line_id") private Long dispenseTaskLineId;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by") private Long createdBy;
    @Column(name = "submitted_at") private Instant submittedAt;
    @Column(name = "submitted_by") private Long submittedBy;
    @Column(name = "taken_at") private Instant takenAt;
    @Column(name = "taken_by") private Long takenBy;
    @Column(name = "cancelled_at") private Instant cancelledAt;
    @Column(name = "cancelled_by") private Long cancelledBy;
    @Column(name = "cancel_reason") private String cancelReason;

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
