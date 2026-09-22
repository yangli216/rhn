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
@Table(name = "RHN_EX_INP_ORDER_WF")
public class InpatientOrderWorkflow {
    @Id @Column(name = "ID_CARE_REQ") private Long requestId;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CARE_EPISODE", nullable = false) private Long episodeId;
    @Column(name = "SD_DUR_TYPE", nullable = false) private String durationType;
    @Column(name = "SD_WF_STATUS", nullable = false) private String workflowStatus;
    @Column(name = "ID_AUTHRD_PRACT") private Long authoredPractitionerId;
    @Column(name = "QTY_MED_PER_OCC", precision = 28, scale = 8)
    private BigDecimal medicationQuantityPerOccurrence;
    @Column(name = "MED_QTY_UNIT") private String medicationQuantityUnit;
    @Column(name = "QTY_MED_BASE_PER_OCC", precision = 28, scale = 8)
    private BigDecimal medicationBaseQuantityPerOccurrence;
    @Column(name = "MED_BASE_UNIT") private String medicationBaseUnit;
    @Column(name = "ID_USER_SIGNED") private Long signedBy;
    @Column(name = "DT_SIGNED") private Instant signedAt;
    @Column(name = "ID_USER_VRFD") private Long verifiedBy;
    @Column(name = "DT_VRFD") private Instant verifiedAt;
    @Column(name = "ID_USER_STOPPED") private Long stoppedBy;
    @Column(name = "DT_STOPPED") private Instant stoppedAt;
    @Column(name = "DES_STOP_REASON") private String stopReason;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;

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
