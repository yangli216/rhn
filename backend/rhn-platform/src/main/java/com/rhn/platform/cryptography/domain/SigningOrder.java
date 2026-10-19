package com.rhn.platform.cryptography.domain;

import com.rhn.platform.cryptography.api.SigningMode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Duration;
import java.time.Instant;

/**
 * One request for a personal CA signature over an attestation evidence statement. The evidence
 * statement to be signed is frozen here at request time; the evidence row is only written after the
 * returned signature has been verified locally.
 */
@Entity
@Table(name = "RHN_AUD_CA_SIGN_ORDER")
public class SigningOrder {
    @Id @Column(name = "ID_SIGN_ORDER") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG") private Long organizationId;
    @Column(name = "ID_USER", nullable = false) private Long userId;
    @Column(name = "NA_ACTOR", nullable = false) private String actor;
    @Column(name = "ID_CA_SIGNER") private Long signerId;
    @Column(name = "ID_CRYPTO_EVID_ATTEST", nullable = false) private Long attestationEvidenceId;
    @Column(name = "ID_CRYPTO_EVID_RESULT", nullable = false) private Long resultEvidenceId;
    @Column(name = "CD_SCENE", nullable = false) private String sceneCode;
    @Column(name = "CD_CA_VENDOR", nullable = false) private String vendorCode;
    @Column(name = "PRVDR_ASSUR", nullable = false) private String vendorAssurance;
    @Enumerated(EnumType.STRING) @Column(name = "SD_SIGN_MODE", nullable = false) private SigningMode mode;
    @Enumerated(EnumType.STRING) @Column(name = "SD_STATUS", nullable = false) private SigningOrderStatus status;
    @Column(name = "SN_STMT_VER", nullable = false) private int statementVersion;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "JSON_STMT", nullable = false) private String statementJson;
    @Column(name = "STMT_DIGEST_ALGO", nullable = false) private String statementDigestAlgorithm;
    @Column(name = "HASH_STMT", nullable = false) private String statementDigest;
    @Column(name = "CONTENT_DIGEST_ALGO", nullable = false) private String contentDigestAlgorithm;
    @Column(name = "HASH_CONTENT", nullable = false) private String contentDigest;
    @Column(name = "ID_CRYPTO_EVID_PREV") private Long previousEvidenceId;
    @Column(name = "ID_CORR", nullable = false) private String correlationId;
    @Column(name = "DES_SUBJECT", nullable = false) private String subject;
    @Column(name = "DES_PAT_DISP") private String patientDisplay;
    @Column(name = "ID_EXT_ORDER") private String externalOrderId;
    @Column(name = "DES_CLAIM") private String claimContent;
    @Column(name = "SN_ATMPTS", nullable = false) private int attempts;
    @Column(name = "DT_NEXT_CHECK") private Instant nextCheckAt;
    @Column(name = "CD_ERROR") private String errorCode;
    @Column(name = "DES_ERROR_MSG") private String errorMessage;
    @Column(name = "DT_EXPIRES", nullable = false) private Instant expiresAt;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "DT_CMPLD") private Instant completedAt;

    protected SigningOrder() {
    }

    public SigningOrder(Long id, Long tenantId, Long organizationId, Long userId, String actor, Long signerId,
                        Long attestationEvidenceId, Long resultEvidenceId, String sceneCode, String vendorCode,
                        String vendorAssurance, SigningMode mode, PreparedStatement statement,
                        String correlationId, String subject, String patientDisplay, Instant now, Duration ttl) {
        this.id = id;
        this.tenantId = tenantId;
        this.organizationId = organizationId;
        this.userId = userId;
        this.actor = actor;
        this.signerId = signerId;
        this.attestationEvidenceId = attestationEvidenceId;
        this.resultEvidenceId = resultEvidenceId;
        this.sceneCode = sceneCode;
        this.vendorCode = vendorCode;
        this.vendorAssurance = vendorAssurance;
        this.mode = mode;
        this.status = SigningOrderStatus.PENDING;
        this.statementVersion = statement.version();
        this.statementJson = statement.json();
        this.statementDigestAlgorithm = statement.digestAlgorithm();
        this.statementDigest = statement.digest();
        this.contentDigestAlgorithm = statement.contentDigestAlgorithm();
        this.contentDigest = statement.contentDigest();
        this.previousEvidenceId = statement.previousEvidenceId();
        this.correlationId = correlationId;
        this.subject = subject;
        this.patientDisplay = patientDisplay;
        this.nextCheckAt = now;
        this.expiresAt = now.plus(ttl);
        this.createdAt = now;
        this.updatedAt = now;
    }

    /** Statement frozen at request time; {@code digest} is Base64 of the statement digest. */
    public record PreparedStatement(int version, String json, String digestAlgorithm, String digest,
                                    String contentDigestAlgorithm, String contentDigest, Long previousEvidenceId) {}

    /** Marks the order as being worked on so a second instance skips it until the lease expires. */
    public void claim(Instant now, Duration lease) {
        this.nextCheckAt = now.plus(lease);
        this.updatedAt = now;
    }

    public void submitted(String externalOrderId, String claimContent, SigningOrderStatus status,
                          Instant now, Duration nextCheck) {
        this.externalOrderId = externalOrderId;
        this.claimContent = claimContent;
        transition(status, now, nextCheck);
    }

    public void submitFailed(String code, String message, Instant now, Duration retryAfter, boolean giveUp) {
        this.attempts++;
        this.errorCode = code;
        this.errorMessage = truncate(message);
        if (giveUp) {
            transition(SigningOrderStatus.FAILED, now, null);
        } else {
            this.nextCheckAt = now.plus(retryAfter);
            this.updatedAt = now;
        }
    }

    public void polled(SigningOrderStatus status, String claimContent, Instant now, Duration nextCheck) {
        this.attempts++;
        if (claimContent != null) this.claimContent = claimContent;
        transition(status, now, nextCheck);
    }

    public void bindSigner(Long signerId) {
        this.signerId = signerId;
    }

    public void verified(Instant now) {
        this.errorCode = null;
        this.errorMessage = null;
        transition(SigningOrderStatus.VERIFIED, now, null);
    }

    public void fail(String code, String message, Instant now) {
        this.errorCode = code;
        this.errorMessage = truncate(message);
        transition(SigningOrderStatus.FAILED, now, null);
    }

    public void finish(SigningOrderStatus status, Instant now) {
        transition(status, now, null);
    }

    private void transition(SigningOrderStatus next, Instant now, Duration nextCheck) {
        if (status.terminal() && !(status == SigningOrderStatus.VERIFIED && next == SigningOrderStatus.VOIDED_BY_SIGNER)) {
            throw new IllegalStateException("Signing order " + id + " is already " + status);
        }
        this.status = next;
        this.updatedAt = now;
        this.nextCheckAt = next.terminal() || nextCheck == null ? null : now.plus(nextCheck);
        if (next.terminal() && completedAt == null) this.completedAt = now;
        if (next.terminal()) this.claimContent = null;
    }

    private static String truncate(String value) {
        if (value == null) return null;
        return value.length() <= 500 ? value : value.substring(0, 500);
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long userId() { return userId; }
    public String actor() { return actor; }
    public Long signerId() { return signerId; }
    public Long attestationEvidenceId() { return attestationEvidenceId; }
    public Long resultEvidenceId() { return resultEvidenceId; }
    public String sceneCode() { return sceneCode; }
    public String vendorCode() { return vendorCode; }
    public String vendorAssurance() { return vendorAssurance; }
    public SigningMode mode() { return mode; }
    public SigningOrderStatus status() { return status; }
    public int statementVersion() { return statementVersion; }
    public String statementJson() { return statementJson; }
    public String statementDigestAlgorithm() { return statementDigestAlgorithm; }
    public String statementDigest() { return statementDigest; }
    public String contentDigestAlgorithm() { return contentDigestAlgorithm; }
    public String contentDigest() { return contentDigest; }
    public Long previousEvidenceId() { return previousEvidenceId; }
    public String correlationId() { return correlationId; }
    public String subject() { return subject; }
    public String patientDisplay() { return patientDisplay; }
    public String externalOrderId() { return externalOrderId; }
    public String claimContent() { return claimContent; }
    public int attempts() { return attempts; }
    public Instant nextCheckAt() { return nextCheckAt; }
    public String errorCode() { return errorCode; }
    public String errorMessage() { return errorMessage; }
    public Instant expiresAt() { return expiresAt; }
    public Instant createdAt() { return createdAt; }
    public Instant updatedAt() { return updatedAt; }
    public Instant completedAt() { return completedAt; }
}
