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
@Table(name = "RHN_AUD_CRYPTO_EVID")
public class CryptographicEvidence {
    @Id
    @Column(name = "ID_CRYPTO_EVID") private Long id;
    @Column(name = "ID_TNT", nullable = false)
    private Long tenantId;
    @Column(name = "SD_TARGET_TYPE", nullable = false)
    private String targetType;
    @Column(name = "ID_TARGET", nullable = false)
    private Long targetId;
    @Column(name = "CD_TARGET_VER_NO")
    private Long targetVersionNo;
    @Column(name = "CD_OPERATION", nullable = false)
    private String operationCode;
    @Column(name = "SD_PROTECTION_PROF", nullable = false)
    private String protectionProfile;
    @Column(name = "SD_PROTECTION_PURPOSE", nullable = false)
    private String protectionPurpose;
    @Column(name = "JSON_CONTENT_SCHEMA", nullable = false)
    private String contentSchema;
    @Column(name = "CONTENT_DIGEST_ALGORITHM", nullable = false)
    private String contentDigestAlgorithm;
    @Column(name = "HASH_CONTENT", nullable = false)
    private String contentDigest;
    @Column(name = "SN_STATEMENT_VER", nullable = false)
    private int statementVersion;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "JSON_STATEMENT", nullable = false)
    private String statementJson;
    @Column(name = "STATEMENT_DIGEST_ALGORITHM", nullable = false)
    private String statementDigestAlgorithm;
    @Column(name = "HASH_STATEMENT", nullable = false)
    private String statementDigest;
    @Column(name = "ID_CRYPTO_EVID_PREVIOUS")
    private Long previousEvidenceId;
    @Column(name = "CD_PROVIDER", nullable = false)
    private String providerCode;
    @Column(name = "PROVIDER_ASSURANCE", nullable = false)
    private String providerAssurance;
    @Column(name = "SD_SIGN_ALGORITHM", nullable = false)
    private String signatureAlgorithm;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "SIGNATURE_VALUE", nullable = false)
    private String signatureValue;
    @Column(name = "ID_KEY", nullable = false)
    private String keyId;
    @Column(name = "SD_SIGNER_TYPE", nullable = false)
    private String signerType;
    @Column(name = "ID_SIGNER_SUBJECT")
    private Long signerSubjectId;
    @Column(name = "NA_SIGNER", nullable = false)
    private String signerName;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "DES_VERIFICATION_MATERIAL")
    private String verificationMaterial;
    @Column(name = "CD_CERTIFICATE_SERIAL")
    private String certificateSerial;
    @Column(name = "CERTIFICATE_ISSUER")
    private String certificateIssuer;
    @Column(name = "DT_SIGNED", nullable = false)
    private Instant signedAt;
    @Column(name = "TIMESTAMP_AUTHORITY")
    private String timestampAuthority;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "TIMESTAMP_TOKEN")
    private String timestampToken;
    @Column(name = "ID_CORRELATION", nullable = false)
    private String correlationId;
    @Column(name = "DT_RECORDED", nullable = false)
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
