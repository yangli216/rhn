package com.rhn.platform.printing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_META_PRINT_TASK_DEF")
public class PrintBusinessDefinition {
    @Id @Column(name = "ID_PRINT_TASK_DEF") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "CD_TASK", nullable = false) private String taskCode;
    @Column(name = "NA_TASK", nullable = false) private String taskName;
    @Column(name = "SD_CATEGORY", nullable = false) private String category;
    @Column(name = "SD_SOURCE_TYPE", nullable = false) private String sourceType;
    @Column(name = "CD_DATA_PROVIDER", nullable = false) private String dataProviderCode;
    @Column(name = "CD_PAYLOAD_SCHEMA", nullable = false) private String payloadSchema;
    @Column(name = "SN_SCHEMA_VER", nullable = false) private int schemaVersion;
    @Lob @Column(name = "JSON_PURPOSES", nullable = false) private String purposesJson;
    @Column(name = "FG_BATCH", nullable = false) private boolean batchSupported;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;

    protected PrintBusinessDefinition() {}

    public Long id() { return id; }
    public long revision() { return revision; }
    public String taskCode() { return taskCode; }
    public String taskName() { return taskName; }
    public String category() { return category; }
    public String sourceType() { return sourceType; }
    public String dataProviderCode() { return dataProviderCode; }
    public String payloadSchema() { return payloadSchema; }
    public int schemaVersion() { return schemaVersion; }
    public String purposesJson() { return purposesJson; }
    public boolean batchSupported() { return batchSupported; }
    public String status() { return status; }
}
