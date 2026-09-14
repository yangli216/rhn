package com.rhn.platform.printing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_META_PRINT_IMPL")
public class PrintImplementation {
    @Id @Column(name = "ID_PRINT_IMPL") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT") private Long tenantId;
    @Column(name = "CD_IMPL", nullable = false) private String implementationCode;
    @Column(name = "NA_IMPL", nullable = false) private String implementationName;
    @Column(name = "SD_RENDERER", nullable = false) private String rendererType;
    @Column(name = "CD_ADAPTER", nullable = false) private String adapterCode;
    @Column(name = "ID_PRINT_TMPL") private Long templateId;
    @Column(name = "CD_PAYLOAD_SCHEMA", nullable = false) private String payloadSchema;
    @Column(name = "SD_OUTPUT_FORMAT", nullable = false) private String outputFormat;
    @Lob @Column(name = "JSON_CONFIG", nullable = false) private String configJson;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;

    protected PrintImplementation() {}

    public PrintImplementation(Long tenantId, String implementationCode, String implementationName,
                               Long templateId, String payloadSchema, Long actorId) {
        Instant now = Instant.now();
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.implementationCode = implementationCode;
        this.implementationName = implementationName; this.rendererType = "INTERNAL_TEMPLATE";
        this.adapterCode = "RHN_INTERNAL_PDF"; this.templateId = templateId;
        this.payloadSchema = payloadSchema; this.outputFormat = "PDF"; this.configJson = "{}";
        this.status = "ACTIVE"; this.createdAt = now; this.createdBy = actorId;
        this.updatedAt = now; this.updatedBy = actorId;
    }

    public void refresh(String name, Long templateId, String payloadSchema, Long actorId) {
        this.implementationName = name; this.templateId = templateId; this.payloadSchema = payloadSchema;
        this.status = "ACTIVE"; this.updatedAt = Instant.now(); this.updatedBy = actorId;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public String implementationCode() { return implementationCode; }
    public String implementationName() { return implementationName; }
    public String rendererType() { return rendererType; }
    public String adapterCode() { return adapterCode; }
    public Long templateId() { return templateId; }
    public String payloadSchema() { return payloadSchema; }
    public String outputFormat() { return outputFormat; }
    public String configJson() { return configJson; }
    public String status() { return status; }
}
