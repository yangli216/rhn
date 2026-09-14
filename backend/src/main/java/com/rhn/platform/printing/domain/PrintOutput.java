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
@Table(name = "RHN_SYS_PRINT_OUTPUT")
public class PrintOutput {
    @Id @Column(name = "ID_PRINT_OUTPUT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PRINT_TMPL", nullable = false) private Long templateId;
    @Column(name = "ID_PRINT_TMPL_VER", nullable = false) private Long templateVersionId;
    @Column(name = "SD_SRC_TYPE", nullable = false) private String sourceType;
    @Column(name = "ID_SRC", nullable = false) private Long sourceId;
    @Column(name = "SN_SRC_VER", nullable = false) private long sourceVersion;
    @Column(name = "SD_DOC_TYPE", nullable = false) private String documentType;
    @Column(name = "ID_PRINT_TASK_DEF") private Long taskDefinitionId;
    @Column(name = "CD_PRINT_TASK") private String taskCode;
    @Column(name = "ID_PRINT_IMPL") private Long implementationId;
    @Column(name = "ID_PRINT_IMPL_BIND") private Long implementationBindingId;
    @Column(name = "CD_PAYLOAD_SCHEMA") private String payloadSchema;
    @Column(name = "ID_PAT") private Long residentId;
    @Column(name = "ID_ENC") private Long encounterId;
    @Column(name = "ID_ORG") private Long organizationId;
    @Column(name = "ID_DEPT") private Long departmentId;
    @Column(name = "SD_PURPOSE", nullable = false) private String purpose;
    @Lob @Column(name = "JSON_SNAP", nullable = false) private String snapshotJson;
    @Column(name = "NA_FILE", nullable = false) private String fileName;
    @Column(name = "SD_MEDIA_TYPE", nullable = false) private String mediaType;
    @Lob @Column(name = "CONTENT_BASE64", nullable = false) private String contentBase64;
    @Column(name = "CONTENT_DIGEST_ALGORITHM", nullable = false) private String contentDigestAlgorithm;
    @Column(name = "HASH_CONTENT", nullable = false) private String contentDigest;
    @Column(name = "DT_GENERATED", nullable = false) private Instant generatedAt;
    @Column(name = "ID_USER_GENERATED", nullable = false) private Long generatedBy;

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

    public PrintOutput(Long tenantId, PrintTemplate template, PrintTemplateVersion templateVersion,
                       PrintBusinessDefinition task, PrintImplementation implementation,
                       PrintImplementationBinding implementationBinding,
                       String sourceType, Long sourceId, long sourceVersion, String documentType,
                       Long residentId, Long encounterId, Long organizationId, Long departmentId,
                       String purpose, String snapshotJson, String fileName, byte[] content,
                       String digestAlgorithm, String digest, Long actorId) {
        this(tenantId, template, templateVersion, sourceType, sourceId, sourceVersion, documentType,
                residentId, encounterId, organizationId, departmentId, purpose, snapshotJson, fileName,
                content, digestAlgorithm, digest, actorId);
        this.taskDefinitionId = task.id(); this.taskCode = task.taskCode();
        this.implementationId = implementation.id(); this.implementationBindingId = implementationBinding.id();
        this.payloadSchema = task.payloadSchema();
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long templateId() { return templateId; }
    public Long templateVersionId() { return templateVersionId; }
    public String sourceType() { return sourceType; }
    public Long sourceId() { return sourceId; }
    public long sourceVersion() { return sourceVersion; }
    public String documentType() { return documentType; }
    public Long taskDefinitionId() { return taskDefinitionId; }
    public String taskCode() { return taskCode; }
    public Long implementationId() { return implementationId; }
    public Long implementationBindingId() { return implementationBindingId; }
    public String payloadSchema() { return payloadSchema; }
    public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public String purpose() { return purpose; }
    public String fileName() { return fileName; }
    public String mediaType() { return mediaType; }
    public byte[] content() { return Base64.getDecoder().decode(contentBase64); }
    public String contentDigestAlgorithm() { return contentDigestAlgorithm; }
    public String contentDigest() { return contentDigest; }
    public Instant generatedAt() { return generatedAt; }
    public Long generatedBy() { return generatedBy; }
}
