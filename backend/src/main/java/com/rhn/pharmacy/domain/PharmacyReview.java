package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_PHARM_REVIEW")
public class PharmacyReview {
    @Id @Column(name = "ID_PHARM_REVIEW") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CARE_REQ", nullable = false) private Long requestId;
    @Column(name = "ID_DISP_TASK", nullable = false) private Long taskId;
    @Column(name = "CD_REVIEW_NO", nullable = false) private String reviewNo;
    @Column(name = "SD_RESULT", nullable = false) private String result;
    @Column(name = "CD_REASON") private String reasonCode;
    @Column(name = "DES_PHARM_REVIEW") private String description;
    @Column(name = "ID_PHARMACIST_PRACT", nullable = false) private Long pharmacistPractitionerId;
    @Column(name = "ID_REVIEWER_USER", nullable = false) private Long reviewerUserId;
    @Column(name = "ID_REVIEWER_ASSIGN", nullable = false) private Long reviewerAssignmentId;
    @Column(name = "DT_REVIEWED", nullable = false) private Instant reviewedAt;

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
