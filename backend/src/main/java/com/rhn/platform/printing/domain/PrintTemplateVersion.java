package com.rhn.platform.printing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "print_template_versions")
public class PrintTemplateVersion {
    @Id private Long id;
    @Column(name = "template_id", nullable = false) private Long templateId;
    @Column(name = "version_no", nullable = false) private int versionNo;
    @Column(name = "layout_schema", nullable = false) private String layoutSchema;
    @Lob @Column(name = "config_json", nullable = false) private String configJson;
    @Column(name = "content_digest_algorithm", nullable = false) private String contentDigestAlgorithm;
    @Column(name = "content_digest", nullable = false) private String contentDigest;
    @Column(name = "published_at", nullable = false) private Instant publishedAt;
    @Column(name = "published_by") private Long publishedBy;

    protected PrintTemplateVersion() {}

    public Long id() { return id; }
    public Long templateId() { return templateId; }
    public int versionNo() { return versionNo; }
    public String layoutSchema() { return layoutSchema; }
    public String configJson() { return configJson; }
}
