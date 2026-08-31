package com.rhn.inpatient.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.math.BigDecimal;

import static com.rhn.shared.api.BusinessErrors.conflict;

@Entity
@Table(name = "inpatient_order_workflows")
public class InpatientOrderWorkflow {
    @Id @Column(name = "request_id") private Long requestId;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "episode_id", nullable = false) private Long episodeId;
    @Column(name = "duration_type", nullable = false) private String durationType;
    @Column(name = "workflow_status", nullable = false) private String workflowStatus;
    @Column(name = "authored_practitioner_id") private Long authoredPractitionerId;
    @Column(name = "medication_quantity_per_occurrence", precision = 28, scale = 8)
    private BigDecimal medicationQuantityPerOccurrence;
    @Column(name = "medication_quantity_unit") private String medicationQuantityUnit;
    @Column(name = "medication_base_quantity_per_occurrence", precision = 28, scale = 8)
    private BigDecimal medicationBaseQuantityPerOccurrence;
    @Column(name = "medication_base_unit") private String medicationBaseUnit;
    @Column(name = "signed_by") private Long signedBy;
    @Column(name = "signed_at") private Instant signedAt;
    @Column(name = "verified_by") private Long verifiedBy;
    @Column(name = "verified_at") private Instant verifiedAt;
    @Column(name = "stopped_by") private Long stoppedBy;
    @Column(name = "stopped_at") private Instant stoppedAt;
    @Column(name = "stop_reason") private String stopReason;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected InpatientOrderWorkflow() {
    }

    public InpatientOrderWorkflow(Long requestId, Long tenantId, Long episodeId, String durationType,
                                  Long authoredPractitionerId, BigDecimal medicationQuantityPerOccurrence,
                                  String medicationQuantityUnit, BigDecimal medicationBaseQuantityPerOccurrence,
                                  String medicationBaseUnit, Long actorId) {
        this.requestId = requestId;
        this.tenantId = tenantId;
        this.episodeId = episodeId;
        this.durationType = durationType;
        this.workflowStatus = "DRAFT";
        this.authoredPractitionerId = authoredPractitionerId;
        this.medicationQuantityPerOccurrence = medicationQuantityPerOccurrence;
        this.medicationQuantityUnit = medicationQuantityUnit;
        this.medicationBaseQuantityPerOccurrence = medicationBaseQuantityPerOccurrence;
        this.medicationBaseUnit = medicationBaseUnit;
        this.updatedBy = actorId;
        this.updatedAt = Instant.now();
    }

    public void sign(long expectedRevision, Long actorId) {
        requireRevision(expectedRevision);
        requireStatus("DRAFT", "INPATIENT_ORDER_NOT_DRAFT", "只有草稿医嘱可以签署");
        this.workflowStatus = "SIGNED";
        this.signedBy = actorId;
        this.signedAt = Instant.now();
        touch(actorId);
    }

    public void verify(long expectedRevision, Long actorId) {
        requireRevision(expectedRevision);
        requireStatus("SIGNED", "INPATIENT_ORDER_NOT_SIGNED", "只有已签署医嘱可以核对");
        this.workflowStatus = "ACTIVE";
        this.verifiedBy = actorId;
        this.verifiedAt = Instant.now();
        touch(actorId);
    }

    public void recordPlan(long expectedRevision, Long actorId) {
        requireRevision(expectedRevision);
        requireStatus("ACTIVE", "INPATIENT_ORDER_NOT_ACTIVE", "只有已核对医嘱可以生成执行计划");
        touch(actorId);
    }

    public void stop(long expectedRevision, Long actorId, String reason) {
        requireRevision(expectedRevision);
        requireStatus("ACTIVE", "INPATIENT_ORDER_NOT_ACTIVE", "只有执行中的医嘱可以停止");
        this.workflowStatus = "STOPPED";
        this.stoppedBy = actorId;
        this.stoppedAt = Instant.now();
        this.stopReason = reason;
        touch(actorId);
    }

    public boolean completeTemporaryIf(boolean allTasksTerminal, Long actorId) {
        if (!allTasksTerminal || !"TEMPORARY".equals(durationType) || !"ACTIVE".equals(workflowStatus)) return false;
        this.workflowStatus = "COMPLETED";
        touch(actorId);
        return true;
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) {
            throw conflict("INPATIENT_ORDER_REVISION_CONFLICT", "住院医嘱已被其他用户更新，请刷新后重试");
        }
    }

    private void requireStatus(String expected, String code, String message) {
        if (!expected.equals(workflowStatus)) throw conflict(code, message);
    }

    private void touch(Long actorId) {
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public Long requestId() { return requestId; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long episodeId() { return episodeId; }
    public String durationType() { return durationType; }
    public String workflowStatus() { return workflowStatus; }
    public Long authoredPractitionerId() { return authoredPractitionerId; }
    public BigDecimal medicationQuantityPerOccurrence() { return medicationQuantityPerOccurrence; }
    public String medicationQuantityUnit() { return medicationQuantityUnit; }
    public BigDecimal medicationBaseQuantityPerOccurrence() { return medicationBaseQuantityPerOccurrence; }
    public String medicationBaseUnit() { return medicationBaseUnit; }
    public Long signedBy() { return signedBy; }
    public Instant signedAt() { return signedAt; }
    public Long verifiedBy() { return verifiedBy; }
    public Instant verifiedAt() { return verifiedAt; }
    public Long stoppedBy() { return stoppedBy; }
    public Instant stoppedAt() { return stoppedAt; }
    public String stopReason() { return stopReason; }
}
