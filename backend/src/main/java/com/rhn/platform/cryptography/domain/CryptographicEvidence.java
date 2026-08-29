package com.rhn.platform.cryptography.domain;

import com.rhn.platform.cryptography.api.ProtectionRequest;
import com.rhn.platform.cryptography.spi.ProviderDescriptor;
import com.rhn.platform.cryptography.spi.SignatureMaterial;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "cryptographic_evidence")
public class CryptographicEvidence {
    @Id
    private Long id;
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;
    @Column(name = "target_type", nullable = false)
    private String targetType;
    @Column(name = "target_id", nullable = false)
    private Long targetId;
    @Column(name = "target_version_no")
    private Long targetVersionNo;
    @Column(name = "operation_code", nullable = false)
    private String operationCode;
    @Column(name = "protection_profile", nullable = false)
    private String protectionProfile;
    @Column(name = "protection_purpose", nullable = false)
    private String protectionPurpose;
    @Column(name = "content_schema", nullable = false)
    private String contentSchema;
    @Column(name = "content_digest_algorithm", nullable = false)
    private String contentDigestAlgorithm;
    @Column(name = "content_digest", nullable = false)
    private String contentDigest;
    @Column(name = "statement_version", nullable = false)
    private int statementVersion;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "statement_json", nullable = false)
    private String statementJson;
    @Column(name = "statement_digest_algorithm", nullable = false)
    private String statementDigestAlgorithm;
    @Column(name = "statement_digest", nullable = false)
    private String statementDigest;
    @Column(name = "previous_evidence_id")
    private Long previousEvidenceId;
    @Column(name = "provider_code", nullable = false)
    private String providerCode;
    @Column(name = "provider_assurance", nullable = false)
    private String providerAssurance;
    @Column(name = "signature_algorithm", nullable = false)
    private String signatureAlgorithm;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "signature_value", nullable = false)
    private String signatureValue;
    @Column(name = "key_id", nullable = false)
    private String keyId;
    @Column(name = "signer_type", nullable = false)
    private String signerType;
    @Column(name = "signer_subject_id")
    private Long signerSubjectId;
    @Column(name = "signer_name", nullable = false)
    private String signerName;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "verification_material")
    private String verificationMaterial;
    @Column(name = "certificate_serial")
    private String certificateSerial;
    @Column(name = "certificate_issuer")
    private String certificateIssuer;
    @Column(name = "signed_at", nullable = false)
    private Instant signedAt;
    @Column(name = "timestamp_authority")
    private String timestampAuthority;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "timestamp_token")
    private String timestampToken;
    @Column(name = "correlation_id", nullable = false)
    private String correlationId;
    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    protected CryptographicEvidence() {
    }

    public CryptographicEvidence(Long id, Long tenantId, ProtectionRequest request,
                                 String contentDigestAlgorithm, String contentDigest,
                                 int statementVersion, String statementJson,
                                 String statementDigestAlgorithm, String statementDigest,
                                 Long previousEvidenceId, ProviderDescriptor provider,
                                 SignatureMaterial signature, String correlationId) {
        this.id = id;
        this.tenantId = tenantId;
        this.targetType = request.targetType();
        this.targetId = request.targetId();
        this.targetVersionNo = request.targetVersion();
        this.operationCode = request.operationCode();
        this.protectionProfile = request.profile().name();
        this.protectionPurpose = request.profile().purpose().name();
        this.contentSchema = request.contentSchema();
        this.contentDigestAlgorithm = contentDigestAlgorithm;
        this.contentDigest = contentDigest;
        this.statementVersion = statementVersion;
        this.statementJson = statementJson;
        this.statementDigestAlgorithm = statementDigestAlgorithm;
        this.statementDigest = statementDigest;
        this.previousEvidenceId = previousEvidenceId;
        this.providerCode = provider.providerCode();
        this.providerAssurance = provider.assurance().name();
        this.signatureAlgorithm = signature.signatureAlgorithm();
        this.signatureValue = signature.signatureValue();
        this.keyId = signature.keyId();
        this.signerType = signature.signerType().name();
        this.signerSubjectId = signature.signerSubjectId();
        this.signerName = signature.signerName();
        this.verificationMaterial = signature.verificationMaterial();
        this.certificateSerial = signature.certificateSerial();
        this.certificateIssuer = signature.certificateIssuer();
        this.signedAt = signature.signedAt();
        this.timestampAuthority = signature.timestampAuthority();
        this.timestampToken = signature.timestampToken();
        this.correlationId = correlationId;
        this.recordedAt = Instant.now();
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public String targetType() { return targetType; }
    public Long targetId() { return targetId; }
    public Long targetVersionNo() { return targetVersionNo; }
    public String operationCode() { return operationCode; }
    public String protectionProfile() { return protectionProfile; }
    public String protectionPurpose() { return protectionPurpose; }
    public String contentSchema() { return contentSchema; }
    public String contentDigestAlgorithm() { return contentDigestAlgorithm; }
    public String contentDigest() { return contentDigest; }
    public int statementVersion() { return statementVersion; }
    public String statementJson() { return statementJson; }
    public String statementDigestAlgorithm() { return statementDigestAlgorithm; }
    public String statementDigest() { return statementDigest; }
    public Long previousEvidenceId() { return previousEvidenceId; }
    public String providerCode() { return providerCode; }
    public String providerAssurance() { return providerAssurance; }
    public String signatureAlgorithm() { return signatureAlgorithm; }
    public String signatureValue() { return signatureValue; }
    public String keyId() { return keyId; }
    public String signerType() { return signerType; }
    public Long signerSubjectId() { return signerSubjectId; }
    public String signerName() { return signerName; }
    public String verificationMaterial() { return verificationMaterial; }
    public String certificateSerial() { return certificateSerial; }
    public String certificateIssuer() { return certificateIssuer; }
    public Instant signedAt() { return signedAt; }
    public String timestampAuthority() { return timestampAuthority; }
    public String timestampToken() { return timestampToken; }
    public String correlationId() { return correlationId; }
    public Instant recordedAt() { return recordedAt; }
}
