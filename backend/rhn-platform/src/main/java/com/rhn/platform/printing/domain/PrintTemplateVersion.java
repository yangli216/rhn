package com.rhn.platform.printing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_META_PRINT_TMPL_VER")
public class PrintTemplateVersion {
    @Id @Column(name = "ID_PRINT_TMPL_VER") private Long id;
    @Column(name = "ID_PRINT_TMPL", nullable = false) private Long templateId;
    @Column(name = "CD_VER_NO", nullable = false) private int versionNo;
    @Column(name = "ID_PRINT_DOC_DEF") private Long documentDefinitionId;
    @Column(name = "ID_PRINT_MEDIA") private Long mediaProfileId;
    @Column(name = "JSON_LAYOUT_SCHEMA", nullable = false) private String layoutSchema;
    @Lob @Column(name = "JSON_CONFIG", nullable = false) private String configJson;
    @Column(name = "CONTENT_DIGEST_ALGO", nullable = false) private String contentDigestAlgorithm;
    @Column(name = "HASH_CONTENT", nullable = false) private String contentDigest;
    @Column(name = "DT_PUBLISD", nullable = false) private Instant publishedAt;
    @Column(name = "ID_USER_PUBLISD") private Long publishedBy;

    protected PrintTemplateVersion() {}

    public PrintTemplateVersion(Long templateId, int versionNo, Long documentDefinitionId, Long mediaProfileId,
                                String layoutSchema, String configJson, String contentDigest, Long actorId) {
        this.id = GlobalIds.next(); this.templateId = templateId; this.versionNo = versionNo;
        this.documentDefinitionId = documentDefinitionId; this.mediaProfileId = mediaProfileId;
        this.layoutSchema = layoutSchema; this.configJson = configJson;
        this.contentDigestAlgorithm = "SHA-256"; this.contentDigest = contentDigest;
        this.publishedAt = Instant.now(); this.publishedBy = actorId;
    }

    public Long id() { return id; }
    public Long templateId() { return templateId; }
    public int versionNo() { return versionNo; }
    public Long documentDefinitionId() { return documentDefinitionId; }
    public Long mediaProfileId() { return mediaProfileId; }
    public String layoutSchema() { return layoutSchema; }
    public String configJson() { return configJson; }
}
