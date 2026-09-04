package com.rhn.platform.printing.domain;

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
    @Column(name = "JSON_LAYOUT_SCHEMA", nullable = false) private String layoutSchema;
    @Lob @Column(name = "JSON_CONFIG", nullable = false) private String configJson;
    @Column(name = "CONTENT_DIGEST_ALGORITHM", nullable = false) private String contentDigestAlgorithm;
    @Column(name = "HASH_CONTENT", nullable = false) private String contentDigest;
    @Column(name = "DT_PUBLISD", nullable = false) private Instant publishedAt;
    @Column(name = "ID_USER_PUBLISD") private Long publishedBy;

    protected PrintTemplateVersion() {}

    public Long id() { return id; }
    public Long templateId() { return templateId; }
    public int versionNo() { return versionNo; }
    public String layoutSchema() { return layoutSchema; }
    public String configJson() { return configJson; }
}
