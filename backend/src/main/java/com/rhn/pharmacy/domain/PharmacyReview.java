package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "pharmacy_reviews")
public class PharmacyReview {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "request_id", nullable = false) private Long requestId;
    @Column(name = "task_id", nullable = false) private Long taskId;
    @Column(name = "review_no", nullable = false) private String reviewNo;
    @Column(nullable = false) private String result;
    @Column(name = "reason_code") private String reasonCode;
    @Column private String description;
    @Column(name = "pharmacist_practitioner_id", nullable = false) private Long pharmacistPractitionerId;
    @Column(name = "reviewer_user_id", nullable = false) private Long reviewerUserId;
    @Column(name = "reviewer_assignment_id", nullable = false) private Long reviewerAssignmentId;
    @Column(name = "reviewed_at", nullable = false) private Instant reviewedAt;

    protected PharmacyReview() {}

    public PharmacyReview(Long tenantId, Long requestId, Long taskId, String reviewNo, String result,
                          String reasonCode, String description, Long pharmacistPractitionerId,
                          Long reviewerUserId, Long reviewerAssignmentId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.requestId = requestId; this.taskId = taskId;
        this.reviewNo = reviewNo; this.result = result; this.reasonCode = reasonCode; this.description = description;
        this.pharmacistPractitionerId = pharmacistPractitionerId; this.reviewerUserId = reviewerUserId;
        this.reviewerAssignmentId = reviewerAssignmentId; this.reviewedAt = Instant.now();
    }

    public Long id() { return id; }
    public Long requestId() { return requestId; }
    public Long taskId() { return taskId; }
    public String reviewNo() { return reviewNo; }
    public String result() { return result; }
    public String reasonCode() { return reasonCode; }
    public String description() { return description; }
    public Long pharmacistPractitionerId() { return pharmacistPractitionerId; }
    public Long reviewerUserId() { return reviewerUserId; }
    public Long reviewerAssignmentId() { return reviewerAssignmentId; }
    public Instant reviewedAt() { return reviewedAt; }
}
