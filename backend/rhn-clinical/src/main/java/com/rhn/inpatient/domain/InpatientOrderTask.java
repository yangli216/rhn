package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

import static com.rhn.shared.api.BusinessErrors.conflict;

@Entity
@Table(name = "RHN_EX_INP_ORDER_TASK")
public class InpatientOrderTask {
    @Id @Column(name = "ID_INP_ORDER_TASK") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CARE_REQ", nullable = false) private Long requestId;
    @Column(name = "CD_OCC_NO", nullable = false) private int occurrenceNo;
    @Column(name = "DT_SCHEDD", nullable = false) private Instant scheduledAt;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "CD_OUTCOME") private String outcomeCode;
    @Column(name = "DES_EXEC_NOTE") private String executionNote;
    @Column(name = "DT_CMPLD") private Instant completedAt;
    @Column(name = "ID_USER_CMPLD") private Long completedBy;
    @Column(name = "DT_CNCLD") private Instant cancelledAt;
    @Column(name = "DES_CANCEL_REASON") private String cancelReason;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected InpatientOrderTask() {
    }

    public InpatientOrderTask(InpatientOrderWorkflow workflow, int occurrenceNo, Instant scheduledAt, Long actorId) {
        Instant now = Instant.now();
        this.id = GlobalIds.next();
        this.tenantId = workflow.tenantId();
        this.requestId = workflow.requestId();
        this.occurrenceNo = occurrenceNo;
        this.scheduledAt = scheduledAt;
        this.status = "PLANNED";
        this.createdAt = now;
        this.createdBy = actorId;
        this.updatedAt = now;
        this.updatedBy = actorId;
    }

    public void execute(long expectedRevision, Long actorId, String outcomeCode, String note) {
        requirePlanned(expectedRevision);
        this.status = "EXECUTED";
        this.outcomeCode = outcomeCode;
        this.executionNote = note;
        this.completedAt = Instant.now();
        this.completedBy = actorId;
        touch(actorId);
    }

    public void skip(long expectedRevision, Long actorId, String outcomeCode, String note) {
        requirePlanned(expectedRevision);
        this.status = "SKIPPED";
        this.outcomeCode = outcomeCode;
        this.executionNote = note;
        this.completedAt = Instant.now();
        this.completedBy = actorId;
        touch(actorId);
    }

    public boolean cancelIfFuture(Instant stoppedAt, Long actorId, String reason) {
        if (!"PLANNED".equals(status) || !scheduledAt.isAfter(stoppedAt)) return false;
        this.status = "CANCELLED";
        this.cancelledAt = stoppedAt;
        this.cancelReason = reason;
        touch(actorId);
        return true;
    }

    private void requirePlanned(long expectedRevision) {
        if (revision != expectedRevision) {
            throw conflict("INPATIENT_TASK_REVISION_CONFLICT", "执行任务已被其他用户更新，请刷新后重试");
        }
        if (!"PLANNED".equals(status)) {
            throw conflict("INPATIENT_TASK_NOT_PLANNED", "只有待执行任务可以执行或跳过");
        }
    }

    private void touch(Long actorId) {
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public boolean terminal() { return !"PLANNED".equals(status); }
    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long requestId() { return requestId; }
    public int occurrenceNo() { return occurrenceNo; }
    public Instant scheduledAt() { return scheduledAt; }
    public String status() { return status; }
    public String outcomeCode() { return outcomeCode; }
    public String executionNote() { return executionNote; }
    public Instant completedAt() { return completedAt; }
    public Long completedBy() { return completedBy; }
    public Instant cancelledAt() { return cancelledAt; }
    public String cancelReason() { return cancelReason; }
}
