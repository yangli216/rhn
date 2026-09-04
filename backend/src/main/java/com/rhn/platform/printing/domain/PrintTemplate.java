package com.rhn.platform.printing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_META_PRINT_TMPL")
public class PrintTemplate {
    @Id @Column(name = "ID_PRINT_TMPL") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT") private Long tenantId;
    @Column(name = "CD_TMPL", nullable = false) private String templateCode;
    @Column(name = "NA_TMPL", nullable = false) private String templateName;
    @Column(name = "SD_DOC_TYPE", nullable = false) private String documentType;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "SN_CURRENT_VER", nullable = false) private int currentVersion;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;

    protected PrintTemplate() {}

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public String templateCode() { return templateCode; }
    public String templateName() { return templateName; }
    public String documentType() { return documentType; }
    public int currentVersion() { return currentVersion; }
    public Instant updatedAt() { return updatedAt; }
}
