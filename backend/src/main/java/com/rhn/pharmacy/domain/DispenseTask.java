package com.rhn.pharmacy.domain;

import com.rhn.shared.api.BusinessException;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.springframework.http.HttpStatus;

import java.time.Instant;

@Entity
@Table(name = "dispense_tasks")
public class DispenseTask {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "stock_site_id", nullable = false) private Long stockSiteId;
    @Column(name = "latest_review_id") private Long latestReviewId;
    @Column(name = "task_no", nullable = false) private String taskNo;
    @Column(name = "task_type", nullable = false) private String taskType;
    @Column(nullable = false) private String priority;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "due_at") private Instant dueAt;
    @Column(name = "picked_at") private Instant pickedAt;
    @Column(name = "assigned_practitioner_id") private Long assignedPractitionerId;
    @Column(name = "picked_by_user_id") private Long pickedByUserId;
    @Column(name = "picked_assignment_id") private Long pickedAssignmentId;
    @Column(name = "pick_description") private String pickDescription;
    @Column private String description;

    protected DispenseTask() {}

    public DispenseTask(Long tenantId, Long residentId, Long encounterId, Long stockSiteId,
                        String taskNo, String priority, String description) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.encounterId = encounterId; this.stockSiteId = stockSiteId; this.taskNo = taskNo;
        this.taskType = "OUTPATIENT"; this.priority = priority; this.status = "PENDING_REVIEW";
        this.createdAt = Instant.now(); this.description = description;
    }

    public void applyReview(Long reviewId, String result) {
        if (!status.equals("PENDING_REVIEW") && !status.equals("INTERVENTION")) {
            throw new BusinessException("DISPENSE_TASK_REVIEW_STATE_INVALID", "当前发药任务状态不允许审方",
                    HttpStatus.CONFLICT);
        }
        latestReviewId = reviewId;
        status = switch (result) {
            case "PASS", "OVERRIDE" -> "READY_TO_PICK";
            case "INTERVENE" -> "INTERVENTION";
            case "REJECT" -> "REJECTED";
            default -> throw new IllegalArgumentException("Unsupported review result");
        };
    }

    public void markReserved() {
        if (!"READY_TO_PICK".equals(status)) {
            throw new BusinessException("DISPENSE_TASK_RESERVATION_STATE_INVALID",
                    "只有审方通过且待拣货的任务可以预留库存", HttpStatus.CONFLICT);
        }
        status = "PICKING";
        pickedAt = Instant.now();
    }

    public void releaseReservation() {
        if ("READY_TO_PICK".equals(status)) return;
        if ("PARTIALLY_DISPENSED".equals(status)) {
            status = "READY_TO_PICK";
            return;
        }
        if (!"PICKING".equals(status)) {
            throw new BusinessException("DISPENSE_TASK_RELEASE_STATE_INVALID",
                    "当前发药任务状态不能释放库存预留", HttpStatus.CONFLICT);
        }
        status = "READY_TO_PICK";
        pickedAt = null;
    }

    public void expireReservation() {
        if ("PARTIALLY_DISPENSED".equals(status)) {
            status = "READY_TO_PICK";
            return;
        }
        releaseReservation();
    }

    public void completePicking(Long practitionerId, Long userId, Long assignmentId, String description) {
        if (!"PICKING".equals(status)) {
            throw new BusinessException("DISPENSE_TASK_PICKING_STATE_INVALID",
                    "只有已预留并正在配药的任务可以完成配药", HttpStatus.CONFLICT);
        }
        assignedPractitionerId = practitionerId; pickedByUserId = userId; pickedAssignmentId = assignmentId;
        pickDescription = description; pickedAt = Instant.now(); status = "READY_TO_DISPENSE";
    }

    public void recordDispense(boolean completed) {
        if (!"READY_TO_DISPENSE".equals(status) && !"PARTIALLY_DISPENSED".equals(status)) {
            throw new BusinessException("DISPENSE_TASK_EXECUTION_STATE_INVALID",
                    "当前任务尚未完成配药复核，不能发药", HttpStatus.CONFLICT);
        }
        status = completed ? "COMPLETED" : "PARTIALLY_DISPENSED";
    }

    public void recordReturn(boolean fullyReturned) {
        if (!"COMPLETED".equals(status) && !"PARTIALLY_RETURNED".equals(status)) {
            throw new BusinessException("DISPENSE_TASK_RETURN_STATE_INVALID",
                    "当前任务没有可退回的已发药事实", HttpStatus.CONFLICT);
        }
        status = fullyReturned ? "RETURNED" : "PARTIALLY_RETURNED";
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; }
    public Long stockSiteId() { return stockSiteId; }
    public Long latestReviewId() { return latestReviewId; }
    public String taskNo() { return taskNo; }
    public String taskType() { return taskType; }
    public String priority() { return priority; }
    public String status() { return status; }
    public Instant createdAt() { return createdAt; }
    public Instant dueAt() { return dueAt; }
    public Instant pickedAt() { return pickedAt; }
    public Long assignedPractitionerId() { return assignedPractitionerId; }
    public Long pickedByUserId() { return pickedByUserId; }
    public Long pickedAssignmentId() { return pickedAssignmentId; }
    public String pickDescription() { return pickDescription; }
    public String description() { return description; }
}
