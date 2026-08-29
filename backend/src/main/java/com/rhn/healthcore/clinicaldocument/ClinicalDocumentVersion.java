package com.rhn.healthcore.clinicaldocument;

import com.rhn.platform.cryptography.api.EvidenceReceipt;
import com.rhn.shared.api.BusinessException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.http.HttpStatus;

import java.time.Instant;

@Entity
@Table(name = "clinical_document_versions")
class ClinicalDocumentVersion {
    @Id
    private Long id;
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;
    @Column(name = "document_id", nullable = false)
    private Long documentId;
    @Column(name = "version_number", nullable = false)
    private int versionNumber;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "content_json", nullable = false)
    private String contentJson;
    @Column(name = "content_schema", nullable = false)
    private String contentSchema;
    @Column(name = "change_type", nullable = false)
    private String changeType;
    @Column(name = "change_reason", nullable = false)
    private String changeReason;
    @Column(name = "created_by", nullable = false)
    private String createdBy;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "signed_by")
    private String signedBy;
    @Column(name = "signed_at")
    private Instant signedAt;
    @Column(name = "signature_meaning")
    private String signatureMeaning;
    @Column(name = "content_digest_algorithm")
    private String contentDigestAlgorithm;
    @Column(name = "content_digest")
    private String contentDigest;
    @Column(name = "integrity_evidence_id")
    private Long integrityEvidenceId;
    @Column(name = "signature_evidence_id")
    private Long signatureEvidenceId;

    protected ClinicalDocumentVersion() {
    }

    ClinicalDocumentVersion(Long tenantId, Long documentId, int versionNumber, String contentJson,
                            String contentSchema, String changeType, String changeReason, String actor) {
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.documentId = documentId;
        this.versionNumber = versionNumber;
        this.contentJson = contentJson;
        this.contentSchema = contentSchema;
        this.changeType = changeType;
        this.changeReason = changeReason;
        this.createdBy = actor;
        this.createdAt = Instant.now();
    }

    void protect(EvidenceReceipt receipt) {
        if (!"INTEGRITY".equals(receipt.purpose())) {
            throw new IllegalArgumentException("Clinical document content requires integrity evidence");
        }
        this.contentDigestAlgorithm = receipt.contentDigestAlgorithm();
        this.contentDigest = receipt.contentDigest();
        this.integrityEvidenceId = receipt.evidenceId();
    }

    void sign(String actor, String signatureMeaning, EvidenceReceipt receipt) {
        if (signedAt != null) {
            throw new BusinessException("DOCUMENT_VERSION_ALREADY_SIGNED", "该文档版本已经签署",
                    HttpStatus.CONFLICT);
        }
        if (!"NON_REPUDIATION".equals(receipt.purpose())) {
            throw new IllegalArgumentException("Clinical document signature requires non-repudiation evidence");
        }
        this.signedBy = actor;
        this.signedAt = receipt.signedAt();
        this.signatureMeaning = signatureMeaning;
        this.signatureEvidenceId = receipt.evidenceId();
    }

    Long id() { return id; }
    int versionNumber() { return versionNumber; }
    String contentJson() { return contentJson; }
    String contentSchema() { return contentSchema; }
    String changeType() { return changeType; }
    String changeReason() { return changeReason; }
    String createdBy() { return createdBy; }
    Instant createdAt() { return createdAt; }
    String signedBy() { return signedBy; }
    Instant signedAt() { return signedAt; }
    String signatureMeaning() { return signatureMeaning; }
    String contentDigestAlgorithm() { return contentDigestAlgorithm; }
    String contentDigest() { return contentDigest; }
    Long integrityEvidenceId() { return integrityEvidenceId; }
    Long signatureEvidenceId() { return signatureEvidenceId; }
}
