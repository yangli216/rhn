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
@Table(name = "inpatient_order_tasks")
public class InpatientOrderTask {
    @Id private Long id;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "request_id", nullable = false) private Long requestId;
    @Column(name = "occurrence_no", nullable = false) private int occurrenceNo;
    @Column(name = "scheduled_at", nullable = false) private Instant scheduledAt;
    @Column(nullable = false) private String status;
    @Column(name = "outcome_code") private String outcomeCode;
    @Column(name = "execution_note") private String executionNote;
    @Column(name = "completed_at") private Instant completedAt;
    @Column(name = "completed_by") private Long completedBy;
    @Column(name = "cancelled_at") private Instant cancelledAt;
    @Column(name = "cancel_reason") private String cancelReason;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

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
