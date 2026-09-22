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
@Table(name = "RHN_EX_REQ_GRP")
class Prescription {
    @Id @Column(name = "ID_REQ_GRP") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "CD_GRP_NO", nullable = false) private String groupNo;
    @Column(name = "SD_GRP_TYPE", nullable = false) private String groupType;
    @Column(name = "CD_CAT") private String categoryCode;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "ID_ORG_EXEC", nullable = false) private Long performerOrganizationId;
    @Column(name = "ID_DEPT_EXEC", nullable = false) private Long performerDepartmentId;
    @Column(name = "ID_ORG_REQ", nullable = false) private Long requestingOrganizationId;
    @Column(name = "ID_DEPT_REQ", nullable = false) private Long requestingDepartmentId;
    @Column(name = "DT_AUTHRD", nullable = false) private Instant authoredAt;
    @Column(name = "ID_USER_AUTHRD", nullable = false) private Long authoredBy;
    @Column(name = "DT_SUBMTD") private Instant submittedAt;
    @Column(name = "ID_USER_SUBMTD") private Long submittedBy;
    @Column(name = "DT_CNCLD") private Instant cancelledAt;
    @Column(name = "ID_USER_CNCLD") private Long cancelledBy;
    @Column(name = "DES_CANCEL_REASON") private String cancelReason;
    @Column(name = "DES_NOTE") private String note;

    @jakarta.persistence.Lob @Column(name = "JSON_DOC_INFO") private String documentInfoJson;
    @jakarta.persistence.Lob @Column(name = "JSON_SAFETY_REVIEW") private String safetyReviewJson;

    String safetyReviewJson() { return safetyReviewJson; }
    void recordSafetyReview(String json) { safetyReviewJson = json; }

    String documentInfoJson() { return documentInfoJson; }
    void updateDocumentInfo(long expectedRevision, String json) {
        requireRevision(expectedRevision);
        if (!"DRAFT".equals(status)) throw state("仅草稿处方可以修改单据信息");
        documentInfoJson = json;
    }

    protected Prescription() {}

    Prescription(Long tenantId, Long residentId, Long encounterId, String groupNo, String categoryCode,
                 Long performerOrganizationId, Long performerDepartmentId, Long authoredBy, String note) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.encounterId = encounterId; this.groupNo = groupNo; this.groupType = "PRESCRIPTION";
        this.categoryCode = categoryCode; this.status = "DRAFT";
        this.performerOrganizationId = performerOrganizationId;
        this.performerDepartmentId = performerDepartmentId;
        this.requestingOrganizationId = performerOrganizationId;
        this.requestingDepartmentId = performerDepartmentId;
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
    Long requestingOrganizationId() { return requestingOrganizationId; } Long requestingDepartmentId() { return requestingDepartmentId; }
    Instant authoredAt() { return authoredAt; } Long authoredBy() { return authoredBy; }
    Instant submittedAt() { return submittedAt; } Long submittedBy() { return submittedBy; }
    Instant cancelledAt() { return cancelledAt; } Long cancelledBy() { return cancelledBy; }
    String cancelReason() { return cancelReason; } String note() { return note; }
}
