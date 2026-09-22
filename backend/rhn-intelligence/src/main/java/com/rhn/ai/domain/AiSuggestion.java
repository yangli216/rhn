package com.rhn.ai.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "RHN_AI_SUGGEST")
public class AiSuggestion {
    @Id @Column(name = "ID_AI_SUGGEST") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "CD_SUGGEST", nullable = false) private String suggestionCode;
    @Column(name = "SD_SUGGEST_TYPE", nullable = false) private String suggestionType;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "SD_RISK_LEVEL", nullable = false) private String riskLevel;
    @Column(name = "CD_SCHEMA", nullable = false) private String schemaCode;
    @Column(name = "CD_SCHEMA_VER", nullable = false) private String schemaVersion;
    @Column(name = "HASH_CLIENT_CONTEXT", nullable = false) private String clientContextFingerprint;
    @Column(name = "HASH_CONTEXT", nullable = false) private String contextHash;
    @Column(name = "HASH_SERVER_CONTEXT", nullable = false) private String serverContextHash;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "JSON_CONTENT", nullable = false) private String contentJson;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "JSON_EVID", nullable = false) private String evidenceJson;
    @Column(name = "CD_PRVDR", nullable = false) private String providerCode;
    @Column(name = "CD_MODEL") private String modelCode;
    @Column(name = "CD_PROMPT_VER", nullable = false) private String promptVersion;
    @Column(name = "CD_KNOW_VER") private String knowledgeVersion;
    @Column(name = "DT_DATA_CUTOFF") private Instant dataCutoff;
    @Column(name = "DT_GEND", nullable = false) private Instant generatedAt;
    @Column(name = "DT_EXPIRES", nullable = false) private Instant expiresAt;
    @Column(name = "DT_INVLDD") private Instant invalidatedAt;
    @Column(name = "DES_INVLDN_REASON") private String invalidationReason;
    @Column(name = "ID_PRACT_REQD", nullable = false) private Long requestedPractitionerId;
    @Column(name = "ID_USER_REQD", nullable = false) private Long requestedUserId;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;

    protected AiSuggestion() {}

    public AiSuggestion(Long tenantId, Long residentId, Long encounterId, Long organizationId, Long departmentId,
                        String clientContextFingerprint, String contextHash, String contentJson, String evidenceJson,
                        String serverContextHash, String riskLevel, String providerCode, String modelCode,
                        String promptVersion,
                        Long practitionerId, Long userId,
                        Instant generatedAt, Instant expiresAt) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.residentId = residentId;
        this.encounterId = encounterId;
        this.organizationId = organizationId;
        this.departmentId = departmentId;
        this.suggestionCode = "AI-" + this.id;
        this.suggestionType = "CLINICAL_ASSISTANT";
        this.status = "GENERATED";
        this.riskLevel = riskLevel;
        this.schemaCode = "RHN.CLINICAL_ASSISTANT.SUGGESTION";
        this.schemaVersion = "1.0";
        this.clientContextFingerprint = clientContextFingerprint;
        this.contextHash = contextHash;
        this.serverContextHash = serverContextHash;
        this.contentJson = contentJson;
        this.evidenceJson = evidenceJson;
        this.providerCode = providerCode;
        this.modelCode = modelCode;
        this.promptVersion = promptVersion;
        this.knowledgeVersion = "terminology-current";
        this.dataCutoff = generatedAt;
        this.generatedAt = generatedAt;
        this.expiresAt = expiresAt;
        this.requestedPractitionerId = practitionerId;
        this.requestedUserId = userId;
        this.createdAt = generatedAt;
    }

    public void adopt(String sectionCode) {
        if ("ADOPTED".equals(status) || "IGNORED".equals(status)
                || "EXPIRED".equals(status) || "FAILED".equals(status)) {
            throw new IllegalStateException("Terminal suggestion cannot be adopted");
        }
        status = sectionCode == null || "ALL".equals(sectionCode) ? "ADOPTED" : "PARTIALLY_ADOPTED";
    }

    public void ignore() {
        if ("PARTIALLY_ADOPTED".equals(status) || "ADOPTED".equals(status)
                || "EXPIRED".equals(status) || "FAILED".equals(status)) {
            throw new IllegalStateException("Terminal suggestion cannot be ignored");
        }
        status = "IGNORED";
    }

    public void expire(Instant now, String reason) {
        if (!"ADOPTED".equals(status) && !"IGNORED".equals(status) && !"FAILED".equals(status)) {
            status = "EXPIRED";
            invalidatedAt = now;
            invalidationReason = reason;
        }
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public String status() { return status; }
    public String riskLevel() { return riskLevel; }
    public String clientContextFingerprint() { return clientContextFingerprint; }
    public String contextHash() { return contextHash; }
    public String serverContextHash() { return serverContextHash; }
    public String contentJson() { return contentJson; }
    public String evidenceJson() { return evidenceJson; }
    public String providerCode() { return providerCode; }
    public String modelCode() { return modelCode; }
    public String promptVersion() { return promptVersion; }
    public Instant generatedAt() { return generatedAt; }
    public Instant expiresAt() { return expiresAt; }
    public Long requestedPractitionerId() { return requestedPractitionerId; }
    public Long requestedUserId() { return requestedUserId; }
}
