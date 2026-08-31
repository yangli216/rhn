package com.rhn.outpatient.template;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "outpatient_plan_templates")
class OutpatientPlanTemplate {
    @Id private Long id;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id", nullable = false) private Long departmentId;
    @Column(name = "scope_type", nullable = false) private String scopeType;
    @Column(name = "owner_id", nullable = false) private Long ownerId;
    @Column(name = "template_name", nullable = false) private String name;
    private String description;
    @Column(nullable = false) private String status;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(name = "use_count", nullable = false) private long useCount;
    @Column(name = "last_used_at") private Instant lastUsedAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected OutpatientPlanTemplate() {}

    OutpatientPlanTemplate(Long tenantId, Long organizationId, Long departmentId, String scopeType,
                           Long ownerId, String name, String description, int sortOrder, Long actorId, Instant now) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.scopeType = scopeType; this.ownerId = ownerId;
        this.name = name; this.description = description; this.sortOrder = sortOrder;
        this.status = "ACTIVE"; this.createdBy = actorId; this.updatedBy = actorId;
        this.createdAt = now; this.updatedAt = now;
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
    String name() { return name; }
    String description() { return description; }
    String status() { return status; }
    int sortOrder() { return sortOrder; }
    long useCount() { return useCount; }
    Instant lastUsedAt() { return lastUsedAt; }
    Long createdBy() { return createdBy; }
    Instant createdAt() { return createdAt; }
    Long updatedBy() { return updatedBy; }
    Instant updatedAt() { return updatedAt; }
}
