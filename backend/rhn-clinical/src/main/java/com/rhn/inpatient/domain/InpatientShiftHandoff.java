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
@Table(name = "RHN_VIS_INP_SHIFT_HANDOFF")
public class InpatientShiftHandoff {
    @Id @Column(name = "ID_INP_SHIFT_HANDOFF") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "DT_SHIFT_FROM", nullable = false) private Instant shiftFrom;
    @Column(name = "DT_SHIFT_TO", nullable = false) private Instant shiftTo;
    @Column(name = "DES_WARD_SUM", nullable = false) private String wardSummary;
    @Lob @Column(name = "JSON_GENERAL_ITEM", nullable = false) private String generalItemsJson;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "CD_CREATE_COMMAND", nullable = false) private String createCommandCode;
    @Column(name = "HASH_CREATE_REQ", nullable = false) private String createRequestHash;
    @Column(name = "ID_CREATED_BY_SUBJECT", nullable = false) private Long createdBySubjectId;
    @Column(name = "ID_CREATED_BY_PRACT") private Long createdByPractitionerId;
    @Column(name = "NA_CREATOR", nullable = false) private String creatorName;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "JSON_CONTENT_SCHEMA", nullable = false) private String contentSchema;
    @Column(name = "CONTENT_DIGEST_ALGO", nullable = false) private String contentDigestAlgorithm;
    @Column(name = "HASH_CONTENT", nullable = false) private String contentDigest;
    @Column(name = "ID_CRYPTO_EVID_INTGR", nullable = false) private Long integrityEvidenceId;

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

