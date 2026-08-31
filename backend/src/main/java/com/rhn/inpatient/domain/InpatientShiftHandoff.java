package com.rhn.inpatient.domain;

import com.rhn.platform.cryptography.api.EvidenceReceipt;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "inpatient_shift_handoffs")
public class InpatientShiftHandoff {
    @Id private Long id;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id", nullable = false) private Long departmentId;
    @Column(name = "shift_from", nullable = false) private Instant shiftFrom;
    @Column(name = "shift_to", nullable = false) private Instant shiftTo;
    @Column(name = "ward_summary", nullable = false) private String wardSummary;
    @Lob @Column(name = "general_items_json", nullable = false) private String generalItemsJson;
    @Column(nullable = false) private String status;
    @Column(name = "create_command_code", nullable = false) private String createCommandCode;
    @Column(name = "create_request_hash", nullable = false) private String createRequestHash;
    @Column(name = "created_by_subject_id", nullable = false) private Long createdBySubjectId;
    @Column(name = "created_by_practitioner_id") private Long createdByPractitionerId;
    @Column(name = "creator_name", nullable = false) private String creatorName;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "content_schema", nullable = false) private String contentSchema;
    @Column(name = "content_digest_algorithm", nullable = false) private String contentDigestAlgorithm;
    @Column(name = "content_digest", nullable = false) private String contentDigest;
    @Column(name = "integrity_evidence_id", nullable = false) private Long integrityEvidenceId;

    protected InpatientShiftHandoff() {
    }

    public InpatientShiftHandoff(Long tenantId, Long organizationId, Long departmentId,
                                 Instant shiftFrom, Instant shiftTo, String wardSummary,
                                 String generalItemsJson, String createCommandCode,
                                 String createRequestHash, Long createdBySubjectId,
                                 Long createdByPractitionerId, String creatorName,
                                 String contentSchema) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.organizationId = organizationId;
        this.departmentId = departmentId;
        this.shiftFrom = shiftFrom;
        this.shiftTo = shiftTo;
        this.wardSummary = wardSummary;
        this.generalItemsJson = generalItemsJson;
        this.status = "DRAFT";
        this.createCommandCode = createCommandCode;
        this.createRequestHash = createRequestHash;
        this.createdBySubjectId = createdBySubjectId;
        this.createdByPractitionerId = createdByPractitionerId;
        this.creatorName = creatorName;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
        this.contentSchema = contentSchema;
    }

    public void protect(EvidenceReceipt evidence) {
        if (integrityEvidenceId != null) throw new IllegalStateException("ALREADY_PROTECTED");
        this.contentDigestAlgorithm = evidence.contentDigestAlgorithm();
        this.contentDigest = evidence.contentDigest();
        this.integrityEvidenceId = evidence.evidenceId();
    }

    public void submit() {
        if (!"DRAFT".equals(status)) throw new IllegalStateException("NOT_DRAFT");
        status = "SUBMITTED";
        updatedAt = Instant.now();
    }

    public void accept() {
        if (!"SUBMITTED".equals(status)) throw new IllegalStateException("NOT_SUBMITTED");
        status = "ACCEPTED";
        updatedAt = Instant.now();
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public Instant shiftFrom() { return shiftFrom; }
    public Instant shiftTo() { return shiftTo; }
    public String wardSummary() { return wardSummary; }
    public String generalItemsJson() { return generalItemsJson; }
    public String status() { return status; }
    public String createCommandCode() { return createCommandCode; }
    public String createRequestHash() { return createRequestHash; }
    public Long createdBySubjectId() { return createdBySubjectId; }
    public Long createdByPractitionerId() { return createdByPractitionerId; }
    public String creatorName() { return creatorName; }
    public Instant createdAt() { return createdAt; }
    public Instant updatedAt() { return updatedAt; }
    public String contentSchema() { return contentSchema; }
    public String contentDigestAlgorithm() { return contentDigestAlgorithm; }
    public String contentDigest() { return contentDigest; }
    public Long integrityEvidenceId() { return integrityEvidenceId; }
}

