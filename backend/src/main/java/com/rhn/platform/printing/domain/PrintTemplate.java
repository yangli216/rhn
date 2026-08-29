package com.rhn.platform.printing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "print_templates")
public class PrintTemplate {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id") private Long tenantId;
    @Column(name = "template_code", nullable = false) private String templateCode;
    @Column(name = "template_name", nullable = false) private String templateName;
    @Column(name = "document_type", nullable = false) private String documentType;
    @Column(nullable = false) private String status;
    @Column(name = "current_version", nullable = false) private int currentVersion;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by") private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by") private Long updatedBy;

    protected PrintTemplate() {}

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public String templateCode() { return templateCode; }
    public String templateName() { return templateName; }
    public String documentType() { return documentType; }
    public int currentVersion() { return currentVersion; }
    public Instant updatedAt() { return updatedAt; }
}
