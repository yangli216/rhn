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
@Table(name = "outpatient_note_templates")
class OutpatientNoteTemplate {
    @Id private Long id;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id", nullable = false) private Long departmentId;
    @Column(name = "scope_type", nullable = false) private String scopeType;
    @Column(name = "owner_id", nullable = false) private Long ownerId;
    @Column(name = "specialty_code", nullable = false) private String specialtyCode;
    @Column(name = "document_type", nullable = false) private String documentType;
    @Column(name = "content_schema", nullable = false) private String contentSchema;
    @Column(name = "template_name", nullable = false) private String name;
    private String description;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "content_json", nullable = false) private String contentJson;
    @Column(nullable = false) private String status;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(name = "use_count", nullable = false) private long useCount;
    @Column(name = "last_used_at") private Instant lastUsedAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

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
