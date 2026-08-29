package com.rhn.outpatient.ordering;

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
@Table(name = "request_groups")
class Prescription {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "group_no", nullable = false) private String groupNo;
    @Column(name = "group_type", nullable = false) private String groupType;
    @Column(name = "category_code") private String categoryCode;
    @Column(nullable = false) private String status;
    @Column(name = "performer_organization_id", nullable = false) private Long performerOrganizationId;
    @Column(name = "performer_department_id", nullable = false) private Long performerDepartmentId;
    @Column(name = "authored_at", nullable = false) private Instant authoredAt;
    @Column(name = "authored_by", nullable = false) private Long authoredBy;
    @Column(name = "submitted_at") private Instant submittedAt;
    @Column(name = "submitted_by") private Long submittedBy;
    @Column(name = "cancelled_at") private Instant cancelledAt;
    @Column(name = "cancelled_by") private Long cancelledBy;
    @Column(name = "cancel_reason") private String cancelReason;
    private String note;

    protected Prescription() {}

    Prescription(Long tenantId, Long residentId, Long encounterId, String groupNo, String categoryCode,
                 Long performerOrganizationId, Long performerDepartmentId, Long authoredBy, String note) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.encounterId = encounterId; this.groupNo = groupNo; this.groupType = "PRESCRIPTION";
        this.categoryCode = categoryCode; this.status = "DRAFT";
        this.performerOrganizationId = performerOrganizationId;
        this.performerDepartmentId = performerDepartmentId;
        this.authoredAt = Instant.now(); this.authoredBy = authoredBy; this.note = note;
    }

    void submit(long expectedRevision, Long actorId) {
        requireRevision(expectedRevision);
        if (!"DRAFT".equals(status)) throw state("只有草稿处方可以提交");
        status = "ACTIVE"; submittedAt = Instant.now(); submittedBy = actorId;
    }

    void cancel(long expectedRevision, Long actorId, String reason) {
        requireRevision(expectedRevision);
        if ("CANCELLED".equals(status)) throw state("处方已经撤销");
        status = "CANCELLED"; cancelledAt = Instant.now(); cancelledBy = actorId; cancelReason = reason;
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw new BusinessException("PRESCRIPTION_REVISION_CONFLICT",
                "处方已被其他用户修改，请刷新后重试", HttpStatus.CONFLICT);
    }

    private BusinessException state(String message) {
        return new BusinessException("PRESCRIPTION_STATE_INVALID", message, HttpStatus.CONFLICT);
    }

    Long id() { return id; } long revision() { return revision; } Long tenantId() { return tenantId; }
    Long residentId() { return residentId; } Long encounterId() { return encounterId; } String groupNo() { return groupNo; }
    String groupType() { return groupType; } String categoryCode() { return categoryCode; } String status() { return status; }
    Long performerOrganizationId() { return performerOrganizationId; } Long performerDepartmentId() { return performerDepartmentId; }
    Instant authoredAt() { return authoredAt; } Long authoredBy() { return authoredBy; }
    Instant submittedAt() { return submittedAt; } Long submittedBy() { return submittedBy; }
    Instant cancelledAt() { return cancelledAt; } Long cancelledBy() { return cancelledBy; }
    String cancelReason() { return cancelReason; } String note() { return note; }
}
