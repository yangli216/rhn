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
@Table(name = "ai_suggestions")
public class AiSuggestion {
    @Id private Long id;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id", nullable = false) private Long departmentId;
    @Column(name = "suggestion_code", nullable = false) private String suggestionCode;
    @Column(name = "suggestion_type", nullable = false) private String suggestionType;
    @Column(nullable = false) private String status;
    @Column(name = "risk_level", nullable = false) private String riskLevel;
    @Column(name = "schema_code", nullable = false) private String schemaCode;
    @Column(name = "schema_version", nullable = false) private String schemaVersion;
    @Column(name = "client_context_fingerprint", nullable = false) private String clientContextFingerprint;
    @Column(name = "context_hash", nullable = false) private String contextHash;
    @Column(name = "server_context_hash", nullable = false) private String serverContextHash;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "content_json", nullable = false) private String contentJson;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "evidence_json", nullable = false) private String evidenceJson;
    @Column(name = "provider_code", nullable = false) private String providerCode;
    @Column(name = "model_code") private String modelCode;
    @Column(name = "prompt_version", nullable = false) private String promptVersion;
    @Column(name = "knowledge_version") private String knowledgeVersion;
    @Column(name = "data_cutoff") private Instant dataCutoff;
    @Column(name = "generated_at", nullable = false) private Instant generatedAt;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(name = "invalidated_at") private Instant invalidatedAt;
    @Column(name = "invalidation_reason") private String invalidationReason;
    @Column(name = "requested_practitioner_id", nullable = false) private Long requestedPractitionerId;
    @Column(name = "requested_user_id", nullable = false) private Long requestedUserId;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected AiSuggestion() {}

    public AiSuggestion(Long tenantId, Long residentId, Long encounterId, Long organizationId, Long departmentId,
                        String clientContextFingerprint, String contextHash, String contentJson, String evidenceJson,
                        String serverContextHash, String riskLevel, String providerCode, String modelCode,
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
        this.promptVersion = "local-assist-v1";
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
    public Instant generatedAt() { return generatedAt; }
    public Instant expiresAt() { return expiresAt; }
    public Long requestedPractitionerId() { return requestedPractitionerId; }
    public Long requestedUserId() { return requestedUserId; }
}
