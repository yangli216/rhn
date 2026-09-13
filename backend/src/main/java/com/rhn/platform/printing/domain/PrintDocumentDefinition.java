package com.rhn.platform.printing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "RHN_META_PRINT_DOC_DEF")
public class PrintDocumentDefinition {
    @Id @Column(name = "ID_PRINT_DOC_DEF") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT") private Long tenantId;
    @Column(name = "CD_DOC_TYPE", nullable = false) private String documentType;
    @Column(name = "NA_DOC", nullable = false) private String documentName;
    @Column(name = "SD_DOC_CAT", nullable = false) private String category;
    @Column(name = "SD_LAYOUT_MODE", nullable = false) private String layoutMode;
    @Column(name = "JSON_DATA_SCHEMA", nullable = false) private String dataSchema;
    @Column(name = "SD_SOURCE_TYPE", nullable = false) private String sourceType;
    @Column(name = "SD_STATUS", nullable = false) private String status;

    protected PrintDocumentDefinition() {}

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public String documentType() { return documentType; }
    public String documentName() { return documentName; }
    public String category() { return category; }
    public String layoutMode() { return layoutMode; }
    public String dataSchema() { return dataSchema; }
    public String sourceType() { return sourceType; }
    public String status() { return status; }
}
