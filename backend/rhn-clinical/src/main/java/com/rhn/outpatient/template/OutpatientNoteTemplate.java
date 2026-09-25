package com.rhn.outpatient.template;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "RHN_META_OP_NOTE_TMPL")
class OutpatientNoteTemplate {
    @Id @Column(name = "ID_OP_NOTE_TMPL") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "SD_SCOPE_TYPE", nullable = false) private String scopeType;
    @Column(name = "ID_OWNER", nullable = false) private Long ownerId;
    @Column(name = "CD_SPECLTY", nullable = false) private String specialtyCode;
    @Column(name = "SD_DOC_TYPE", nullable = false) private String documentType;
    @Column(name = "JSON_CONTENT_SCHEMA", nullable = false) private String contentSchema;
    @Column(name = "NA_TMPL", nullable = false) private String name;
    @Column(name = "DES_OP_NOTE_TMPL") private String description;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "JSON_CONTENT", nullable = false) private String contentJson;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;
    @Column(name = "QTY_USE", nullable = false) private long useCount;
    @Column(name = "DT_LAST_USED") private Instant lastUsedAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;

    protected OutpatientNoteTemplate() {}

    OutpatientNoteTemplate(Long tenantId, Long organizationId, Long departmentId, String scopeType,
                           Long ownerId, String specialtyCode, String documentType, String contentSchema,
                           String name, String description, String contentJson, int sortOrder,
                           Long actorId, Instant now) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.scopeType = scopeType; this.ownerId = ownerId;
        this.specialtyCode = specialtyCode; this.documentType = documentType; this.contentSchema = contentSchema;
        this.name = name; this.description = description; this.contentJson = contentJson;
        this.status = "ACTIVE"; this.sortOrder = sortOrder; this.createdBy = actorId;
        this.updatedBy = actorId; this.createdAt = now; this.updatedAt = now;
    }

    void markUsed(Long actorId, Instant now) {
        useCount++; lastUsedAt = now; updatedBy = actorId; updatedAt = now;
    }

    void update(String scopeType, Long ownerId, String specialtyCode, String name,
                String description, String contentJson, int sortOrder, Long actorId, Instant now) {
        this.scopeType = scopeType; this.ownerId = ownerId; this.specialtyCode = specialtyCode;
        this.name = name; this.description = description; this.contentJson = contentJson;
        this.sortOrder = sortOrder; this.updatedBy = actorId; this.updatedAt = now;
    }

    void disable(Long actorId, Instant now) {
        status = "INACTIVE"; updatedBy = actorId; updatedAt = now;
    }

    Long id() { return id; }
    long revision() { return revision; }
    Long tenantId() { return tenantId; }
    Long organizationId() { return organizationId; }
    Long departmentId() { return departmentId; }
    String scopeType() { return scopeType; }
    Long ownerId() { return ownerId; }
    String specialtyCode() { return specialtyCode; }
    String documentType() { return documentType; }
    String contentSchema() { return contentSchema; }
    String name() { return name; }
    String description() { return description; }
    String contentJson() { return contentJson; }
    String status() { return status; }
    int sortOrder() { return sortOrder; }
    long useCount() { return useCount; }
    Instant lastUsedAt() { return lastUsedAt; }
    Instant createdAt() { return createdAt; }
    Instant updatedAt() { return updatedAt; }
}
