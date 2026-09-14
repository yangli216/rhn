package com.rhn.platform.printing.domain;

import com.rhn.shared.api.BusinessException;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.springframework.http.HttpStatus;

import java.time.Instant;

@Entity
@Table(name = "RHN_META_PRINT_IMPL_BIND")
public class PrintImplementationBinding {
    @Id @Column(name = "ID_PRINT_IMPL_BIND") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT") private Long tenantId;
    @Column(name = "ID_ORG") private Long organizationId;
    @Column(name = "ID_DEPT") private Long departmentId;
    @Column(name = "ID_PRINT_TASK_DEF", nullable = false) private Long taskDefinitionId;
    @Column(name = "SD_PURPOSE", nullable = false) private String purpose;
    @Column(name = "ID_PRINT_IMPL", nullable = false) private Long implementationId;
    @Column(name = "SD_SCOPE", nullable = false) private String scopeType;
    @Column(name = "SD_FALLBACK", nullable = false) private String fallbackPolicy;
    @Column(name = "DT_VALID_FROM", nullable = false) private Instant validFrom;
    @Column(name = "DT_VALID_TO") private Instant validTo;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;

    protected PrintImplementationBinding() {}

    public PrintImplementationBinding(Long tenantId, Long organizationId, Long departmentId,
                                      Long taskDefinitionId, String purpose, Long implementationId,
                                      String scopeType, String fallbackPolicy, Long actorId) {
        Instant now = Instant.now();
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.taskDefinitionId = taskDefinitionId; this.purpose = purpose;
        this.implementationId = implementationId; this.scopeType = scopeType;
        this.fallbackPolicy = fallbackPolicy; this.validFrom = now; this.status = "ACTIVE";
        this.createdAt = now; this.createdBy = actorId; this.updatedAt = now; this.updatedBy = actorId;
    }

    public void update(long expectedRevision, Long implementationId, String fallbackPolicy, String status,
                       Long actorId) {
        if (revision != expectedRevision) throw new BusinessException(
                "PRINT_IMPLEMENTATION_BINDING_REVISION_CONFLICT", "打印业务映射已变化，请刷新后重试", HttpStatus.CONFLICT);
        this.implementationId = implementationId; this.fallbackPolicy = fallbackPolicy; this.status = status;
        this.updatedAt = Instant.now(); this.updatedBy = actorId;
    }

    public boolean effectiveAt(Instant value) {
        return "ACTIVE".equals(status) && !validFrom.isAfter(value) && (validTo == null || validTo.isAfter(value));
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public Long taskDefinitionId() { return taskDefinitionId; }
    public String purpose() { return purpose; }
    public Long implementationId() { return implementationId; }
    public String scopeType() { return scopeType; }
    public String fallbackPolicy() { return fallbackPolicy; }
    public Instant validFrom() { return validFrom; }
    public Instant validTo() { return validTo; }
    public String status() { return status; }
}
