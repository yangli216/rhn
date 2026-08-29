package com.rhn.platform.printing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Base64;

@Entity
@Table(name = "print_outputs")
public class PrintOutput {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "template_id", nullable = false) private Long templateId;
    @Column(name = "template_version_id", nullable = false) private Long templateVersionId;
    @Column(name = "source_type", nullable = false) private String sourceType;
    @Column(name = "source_id", nullable = false) private Long sourceId;
    @Column(name = "source_version", nullable = false) private long sourceVersion;
    @Column(name = "document_type", nullable = false) private String documentType;
    @Column(name = "resident_id") private Long residentId;
    @Column(name = "encounter_id") private Long encounterId;
    @Column(name = "organization_id") private Long organizationId;
    @Column(name = "department_id") private Long departmentId;
    @Column(nullable = false) private String purpose;
    @Lob @Column(name = "snapshot_json", nullable = false) private String snapshotJson;
    @Column(name = "file_name", nullable = false) private String fileName;
    @Column(name = "media_type", nullable = false) private String mediaType;
    @Lob @Column(name = "content_base64", nullable = false) private String contentBase64;
    @Column(name = "content_digest_algorithm", nullable = false) private String contentDigestAlgorithm;
    @Column(name = "content_digest", nullable = false) private String contentDigest;
    @Column(name = "generated_at", nullable = false) private Instant generatedAt;
    @Column(name = "generated_by", nullable = false) private Long generatedBy;

    protected PrintOutput() {}

    public PrintOutput(Long tenantId, PrintTemplate template, PrintTemplateVersion templateVersion,
                       String sourceType, Long sourceId, long sourceVersion, String documentType,
                       Long residentId, Long encounterId, Long organizationId, Long departmentId,
                       String purpose, String snapshotJson, String fileName, byte[] content,
                       String digestAlgorithm, String digest, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.templateId = template.id();
        this.templateVersionId = templateVersion.id(); this.sourceType = sourceType; this.sourceId = sourceId;
        this.sourceVersion = sourceVersion; this.documentType = documentType; this.residentId = residentId;
        this.encounterId = encounterId; this.organizationId = organizationId; this.departmentId = departmentId;
        this.purpose = purpose; this.snapshotJson = snapshotJson; this.fileName = fileName;
        this.mediaType = "application/pdf"; this.contentBase64 = Base64.getEncoder().encodeToString(content);
        this.contentDigestAlgorithm = digestAlgorithm; this.contentDigest = digest;
        this.generatedAt = Instant.now(); this.generatedBy = actorId;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long templateId() { return templateId; }
    public Long templateVersionId() { return templateVersionId; }
    public String documentType() { return documentType; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public String fileName() { return fileName; }
    public String mediaType() { return mediaType; }
    public byte[] content() { return Base64.getDecoder().decode(contentBase64); }
    public String contentDigestAlgorithm() { return contentDigestAlgorithm; }
    public String contentDigest() { return contentDigest; }
}
