package com.rhn.pharmacy.domain;

import com.rhn.shared.api.BusinessException;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.springframework.http.HttpStatus;

import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_DISP_TASK")
public class DispenseTask {
    @Id @Column(name = "ID_DISP_TASK") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "ID_STOCK_SITE", nullable = false) private Long stockSiteId;
    @Column(name = "ID_PHARM_REVIEW_LATEST") private Long latestReviewId;
    @Column(name = "CD_TASK_NO", nullable = false) private String taskNo;
    @Column(name = "SD_TASK_TYPE", nullable = false) private String taskType;
    @Column(name = "SD_PRI", nullable = false) private String priority;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_STATUS", nullable = false) private DispenseTaskStatus status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "DT_DUE") private Instant dueAt;
    @Column(name = "DT_PICKED") private Instant pickedAt;
    @Column(name = "ID_ASGND_PRACT") private Long assignedPractitionerId;
    @Column(name = "ID_PICKED_BY_USER") private Long pickedByUserId;
    @Column(name = "ID_PICKED_ASSIGN") private Long pickedAssignmentId;
    @Column(name = "DES_PICK_DESCR") private String pickDescription;
    @Column(name = "DES_DISP_TASK") private String description;

    protected DispenseTask() {}

    public DispenseTask(Long tenantId, Long residentId, Long encounterId, Long stockSiteId,
                        String taskNo, String priority, String description) {
        this(tenantId, residentId, encounterId, stockSiteId, taskNo, "OUTPATIENT", priority, description);
    }

    public DispenseTask(Long tenantId, Long residentId, Long encounterId, Long stockSiteId,
                        String taskNo, String taskType, String priority, String description) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.encounterId = encounterId; this.stockSiteId = stockSiteId; this.taskNo = taskNo;
        this.taskType = taskType; this.priority = priority; this.status = DispenseTaskStatus.PENDING_REVIEW;
        this.createdAt = Instant.now(); this.description = description;
    }

    public void applyReview(Long reviewId, String result) {
        if (status != DispenseTaskStatus.PENDING_REVIEW && status != DispenseTaskStatus.INTERVENTION) {
            throw new BusinessException("DISPENSE_TASK_REVIEW_STATE_INVALID", "当前发药任务状态不允许审方",
                    HttpStatus.CONFLICT);
        }
        latestReviewId = reviewId;
        status = switch (result) {
            case "PASS", "OVERRIDE" -> DispenseTaskStatus.READY_TO_PICK;
            case "INTERVENE" -> DispenseTaskStatus.INTERVENTION;
            case "REJECT" -> DispenseTaskStatus.REJECTED;
            default -> throw new IllegalArgumentException("Unsupported review result");
        };
    }

    public void bypassPreDispenseReview() {
        if (status != DispenseTaskStatus.PENDING_REVIEW) {
            throw new BusinessException("DISPENSE_TASK_REVIEW_BYPASS_STATE_INVALID",
                    "当前发药任务状态不能跳过事前审方", HttpStatus.CONFLICT);
        }
        status = DispenseTaskStatus.READY_TO_PICK;
    }

    public void recordPostDispenseReview(Long reviewId) {
        if (status != DispenseTaskStatus.COMPLETED && status != DispenseTaskStatus.PARTIALLY_RETURNED
                && status != DispenseTaskStatus.RETURNED) {
            throw new BusinessException("DISPENSE_TASK_POST_REVIEW_STATE_INVALID",
                    "只有已实际发药的任务可以进行事后审方", HttpStatus.CONFLICT);
        }
        if (latestReviewId != null) {
            throw new BusinessException("DISPENSE_TASK_POST_REVIEW_DUPLICATE",
                    "当前发药任务已完成事后审方", HttpStatus.CONFLICT);
        }
        latestReviewId = reviewId;
    }

    public void markReserved() {
        if (status != DispenseTaskStatus.READY_TO_PICK) {
            throw new BusinessException("DISPENSE_TASK_RESERVATION_STATE_INVALID",
                    "只有待拣货的任务可以预留库存", HttpStatus.CONFLICT);
        }
        status = DispenseTaskStatus.PICKING;
        pickedAt = Instant.now();
    }

    public void releaseReservation() {
        if (status == DispenseTaskStatus.READY_TO_PICK) return;
        if (status == DispenseTaskStatus.PARTIALLY_DISPENSED) {
            status = DispenseTaskStatus.READY_TO_PICK;
            return;
        }
        if (status != DispenseTaskStatus.PICKING) {
            throw new BusinessException("DISPENSE_TASK_RELEASE_STATE_INVALID",
                    "当前发药任务状态不能释放库存预留", HttpStatus.CONFLICT);
        }
        status = DispenseTaskStatus.READY_TO_PICK;
        pickedAt = null;
    }

    public void expireReservation() {
        if (status == DispenseTaskStatus.PARTIALLY_DISPENSED) {
            status = DispenseTaskStatus.READY_TO_PICK;
            return;
        }
        releaseReservation();
    }

    public void completePicking(Long practitionerId, Long userId, Long assignmentId, String description) {
        if (status != DispenseTaskStatus.PICKING) {
            throw new BusinessException("DISPENSE_TASK_PICKING_STATE_INVALID",
                    "只有已预留并正在配药的任务可以完成配药", HttpStatus.CONFLICT);
        }
        assignedPractitionerId = practitionerId; pickedByUserId = userId; pickedAssignmentId = assignmentId;
        pickDescription = description; pickedAt = Instant.now(); status = DispenseTaskStatus.READY_TO_DISPENSE;
    }

    public void recordDispense(boolean completed) {
        if (status != DispenseTaskStatus.READY_TO_DISPENSE && status != DispenseTaskStatus.PARTIALLY_DISPENSED) {
            throw new BusinessException("DISPENSE_TASK_EXECUTION_STATE_INVALID",
                    "当前任务尚未完成配药复核，不能发药", HttpStatus.CONFLICT);
        }
        status = completed ? DispenseTaskStatus.COMPLETED : DispenseTaskStatus.PARTIALLY_DISPENSED;
    }

    /** Stops all remaining positive fulfillment while retaining prior dispense facts. */
    public void cancelRemainingForOrderStop() {
        if (status == DispenseTaskStatus.CANCELLED || status == DispenseTaskStatus.REJECTED
                || status == DispenseTaskStatus.RETURNED) return;
        status = DispenseTaskStatus.CANCELLED;
    }

    public void recordReturn(boolean fullyReturned) {
        if (status != DispenseTaskStatus.COMPLETED && status != DispenseTaskStatus.PARTIALLY_RETURNED
                && status != DispenseTaskStatus.CANCELLED) {
            throw new BusinessException("DISPENSE_TASK_RETURN_STATE_INVALID",
                    "当前任务没有可退回的已发药事实", HttpStatus.CONFLICT);
        }
        status = fullyReturned ? DispenseTaskStatus.RETURNED : DispenseTaskStatus.PARTIALLY_RETURNED;
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
    public DispenseTaskStatus status() { return status; }
    public Instant createdAt() { return createdAt; }
    public Instant dueAt() { return dueAt; }
    public Instant pickedAt() { return pickedAt; }
    public Long assignedPractitionerId() { return assignedPractitionerId; }
    public Long pickedByUserId() { return pickedByUserId; }
    public Long pickedAssignmentId() { return pickedAssignmentId; }
    public String pickDescription() { return pickDescription; }
    public String description() { return description; }
}
