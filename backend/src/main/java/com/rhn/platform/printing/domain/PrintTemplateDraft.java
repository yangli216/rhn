package com.rhn.platform.printing.domain;

import com.rhn.shared.api.StaleRevisionException;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_META_PRINT_DRAFT")
public class PrintTemplateDraft {
    @Id @Column(name = "ID_PRINT_DRAFT") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PRINT_TMPL") private Long templateId;
    @Column(name = "ID_PRINT_DOC_DEF", nullable = false) private Long documentDefinitionId;
    @Column(name = "ID_PRINT_MEDIA", nullable = false) private Long mediaProfileId;
    @Column(name = "ID_PRINT_TMPL_VER_PUBLISD") private Long publishedVersionId;
    @Column(name = "CD_TMPL", nullable = false) private String templateCode;
    @Column(name = "NA_TMPL", nullable = false) private String templateName;
    @Column(name = "JSON_LAYOUT_SCHEMA", nullable = false) private String layoutSchema;
    @Lob @Column(name = "JSON_CONFIG", nullable = false) private String configJson;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected PrintTemplateDraft() {}

    public PrintTemplateDraft(Long tenantId, Long templateId, Long documentDefinitionId, Long mediaProfileId,
                              String templateCode, String templateName, String layoutSchema, String configJson,
                              Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.templateId = templateId;
        this.documentDefinitionId = documentDefinitionId; this.mediaProfileId = mediaProfileId;
        this.templateCode = templateCode; this.templateName = templateName; this.layoutSchema = layoutSchema;
        this.configJson = configJson; this.status = "DRAFT"; this.createdAt = Instant.now();
        this.createdBy = actorId; this.updatedAt = createdAt; this.updatedBy = actorId;
    }

    public void update(Long documentDefinitionId, Long mediaProfileId, String templateName, String layoutSchema,
                       String configJson, long expectedRevision, Long actorId) {
        requireRevision(expectedRevision);
        if (!"DRAFT".equals(status) && !"REJECTED".equals(status)) {
            throw new IllegalStateException("只有草稿或退回状态的模板可以编辑");
        }
        this.documentDefinitionId = documentDefinitionId; this.mediaProfileId = mediaProfileId;
        this.templateName = templateName; this.layoutSchema = layoutSchema; this.configJson = configJson;
        this.status = "DRAFT"; touch(actorId);
    }

    public void submit(long expectedRevision, Long actorId) {
        requireRevision(expectedRevision);
        if (!"DRAFT".equals(status)) throw new IllegalStateException("只有草稿可以提交审核");
        status = "IN_REVIEW"; touch(actorId);
    }

    public void reject(long expectedRevision, Long actorId) {
        requireRevision(expectedRevision);
        if (!"IN_REVIEW".equals(status)) throw new IllegalStateException("只有待审核模板可以退回");
        status = "REJECTED"; touch(actorId);
    }

    public void publish(Long templateId, Long versionId, long expectedRevision, Long actorId) {
        requireRevision(expectedRevision);
        if (!"IN_REVIEW".equals(status)) throw new IllegalStateException("只有待审核模板可以发布");
        this.templateId = templateId; this.publishedVersionId = versionId;
        this.status = "PUBLISHED"; touch(actorId);
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw new StaleRevisionException(revision, "模板已被其他用户修改，请刷新后重试");
    }

    private void touch(Long actorId) { this.updatedAt = Instant.now(); this.updatedBy = actorId; }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long templateId() { return templateId; }
    public Long documentDefinitionId() { return documentDefinitionId; }
    public Long mediaProfileId() { return mediaProfileId; }
    public Long publishedVersionId() { return publishedVersionId; }
    public String templateCode() { return templateCode; }
    public String templateName() { return templateName; }
    public String layoutSchema() { return layoutSchema; }
    public String configJson() { return configJson; }
    public String status() { return status; }
    public Instant updatedAt() { return updatedAt; }
    public Long updatedBy() { return updatedBy; }
}
