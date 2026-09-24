package com.rhn.outpatient.template;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_META_OP_PLAN_TMPL")
class OutpatientPlanTemplate {
    @Id @Column(name = "ID_OP_PLAN_TMPL") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "SD_SCOPE_TYPE", nullable = false) private String scopeType;
    @Column(name = "ID_OWNER", nullable = false) private Long ownerId;
    @Column(name = "NA_TMPL", nullable = false) private String name;
    @Column(name = "DES_OP_PLAN_TMPL") private String description;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;
    @Column(name = "QTY_USE", nullable = false) private long useCount;
    @Column(name = "DT_LAST_USED") private Instant lastUsedAt;
    @Column(name = "SD_SOURCE_TYPE", nullable = false) private String sourceType;
    @Column(name = "JSON_GUIDELINE_REF") private String guidelineReference;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;

    protected OutpatientPlanTemplate() {}

    OutpatientPlanTemplate(Long tenantId, Long organizationId, Long departmentId, String scopeType,
                           Long ownerId, String name, String description, int sortOrder,
                           String sourceType, String guidelineReference, Long actorId, Instant now) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.scopeType = scopeType; this.ownerId = ownerId;
        this.name = name; this.description = description; this.sortOrder = sortOrder;
        this.sourceType = sourceType == null || sourceType.isBlank() ? "MANUAL" : sourceType;
        this.guidelineReference = guidelineReference;
        this.status = "ACTIVE"; this.createdBy = actorId; this.updatedBy = actorId;
        this.createdAt = now; this.updatedAt = now;
    }

    OutpatientPlanTemplate(Long tenantId, Long organizationId, Long departmentId, String scopeType,
                           Long ownerId, String name, String description, int sortOrder, Long actorId, Instant now) {
        this(tenantId, organizationId, departmentId, scopeType, ownerId, name, description, sortOrder,
                "MANUAL", null, actorId, now);
    }

    void markUsed(Long actorId, Instant now) {
        useCount++; lastUsedAt = now; updatedBy = actorId; updatedAt = now;
    }

    void disable(Long actorId, Instant now) {
        status = "INACTIVE"; updatedBy = actorId; updatedAt = now;
    }

    void update(String scopeType, Long ownerId, String name, String description,
                int sortOrder, String guidelineReference, Long actorId, Instant now) {
        this.scopeType = scopeType;
        this.ownerId = ownerId;
        this.name = name;
        this.description = description;
        this.sortOrder = sortOrder;
        this.guidelineReference = guidelineReference;
        this.updatedBy = actorId;
        this.updatedAt = now;
    }

    Long id() { return id; }
    long revision() { return revision; }
    Long tenantId() { return tenantId; }
    Long organizationId() { return organizationId; }
    Long departmentId() { return departmentId; }
    String scopeType() { return scopeType; }
    Long ownerId() { return ownerId; }
    String name() { return name; }
    String description() { return description; }
    String status() { return status; }
    String sourceType() { return sourceType; }
    String guidelineReference() { return guidelineReference; }
    int sortOrder() { return sortOrder; }
    long useCount() { return useCount; }
    Instant lastUsedAt() { return lastUsedAt; }
    Long createdBy() { return createdBy; }
    Instant createdAt() { return createdAt; }
    Long updatedBy() { return updatedBy; }
    Instant updatedAt() { return updatedAt; }
}
