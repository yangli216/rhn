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
@Table(name = "RHN_VIS_CLIN_DOC_VER")
class ClinicalDocumentVersion {
    @Id
    @Column(name = "ID_CLIN_DOC_VER") private Long id;
    @Column(name = "ID_TNT", nullable = false)
    private Long tenantId;
    @Column(name = "ID_CLIN_DOC", nullable = false)
    private Long documentId;
    @Column(name = "CD_VER_NUMBER", nullable = false)
    private int versionNumber;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "JSON_CONTENT", nullable = false)
    private String contentJson;
    @Column(name = "JSON_CONTENT_SCHEMA", nullable = false)
    private String contentSchema;
    @Column(name = "SD_CHG_TYPE", nullable = false)
    private String changeType;
    @Column(name = "DES_CHG_REASON", nullable = false)
    private String changeReason;
    @Column(name = "ID_USER_CREATED", nullable = false)
    private String createdBy;
    @Column(name = "DT_CREATED", nullable = false)
    private Instant createdAt;
    @Column(name = "ID_USER_SIGNED")
    private String signedBy;
    @Column(name = "DT_SIGNED")
    private Instant signedAt;
    @Column(name = "SD_SIGN_MEANING")
    private String signatureMeaning;
    @Column(name = "CONTENT_DIGEST_ALGORITHM")
    private String contentDigestAlgorithm;
    @Column(name = "HASH_CONTENT")
    private String contentDigest;
    @Column(name = "ID_CRYPTO_EVID_INTEGRITY")
    private Long integrityEvidenceId;
    @Column(name = "ID_CRYPTO_EVID_SIGN")
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
