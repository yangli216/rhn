package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "item_groups")
public class ItemGroup {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id") private Long organizationId;
    @Column(name = "execution_department_id") private Long executionDepartmentId;
    @Column(nullable = false) private String code;
    @Column(nullable = false) private String name;
    @Column(name = "group_type", nullable = false) private String groupType;
    @Column(name = "usage_type") private String usageType;
    @Column(name = "point_of_care", nullable = false) private boolean pointOfCare;
    @Column(nullable = false) private String status;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected ItemGroup() {}

    public ItemGroup(Long tenantId, Long actorId, Long organizationId, Long executionDepartmentId,
                     String code, String name, String groupType, String usageType,
                     boolean pointOfCare, String status, LocalDate validFrom, LocalDate validTo) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.code = require(code, "组套编码");
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        updateValues(actorId, organizationId, executionDepartmentId, name, groupType, usageType,
                pointOfCare, status, validFrom, validTo);
    }

    public void update(long expectedRevision, Long actorId, Long organizationId, Long executionDepartmentId,
                       String name, String groupType, String usageType, boolean pointOfCare,
                       String status, LocalDate validFrom, LocalDate validTo) {
        requireRevision(expectedRevision);
        updateValues(actorId, organizationId, executionDepartmentId, name, groupType, usageType,
                pointOfCare, status, validFrom, validTo);
    }

    public void changeStatus(long expectedRevision, Long actorId, String status) {
        requireRevision(expectedRevision);
        this.status = status;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    private void updateValues(Long actorId, Long organizationId, Long executionDepartmentId,
                              String name, String groupType, String usageType, boolean pointOfCare,
                              String status, LocalDate validFrom, LocalDate validTo) {
        ServiceCatalogItem.requirePeriod(validFrom, validTo);
        if (!java.util.Set.of("LIS", "PACS", "ORDER_SET", "PACKAGE").contains(groupType)) {
            throw new IllegalArgumentException("不支持的组套类型");
        }
        if (executionDepartmentId != null && organizationId == null) {
            throw new IllegalArgumentException("指定执行科室时必须同时指定机构");
        }
        this.organizationId = organizationId;
        this.executionDepartmentId = executionDepartmentId;
        this.name = require(name, "组套名称");
        this.groupType = groupType;
        this.usageType = trim(usageType);
        this.pointOfCare = pointOfCare;
        this.status = status;
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    private static String require(String value, String label) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + "不能为空");
        return value.trim();
    }
    private static String trim(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private void requireRevision(long expected) {
        if (revision != expected) throw new IllegalStateException("项目组套已被其他用户修改，请刷新后重试");
    }

    public Long id() { return id; } public long revision() { return revision; } public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; } public Long executionDepartmentId() { return executionDepartmentId; }
    public String code() { return code; } public String name() { return name; } public String groupType() { return groupType; }
    public String usageType() { return usageType; } public boolean pointOfCare() { return pointOfCare; }
    public String status() { return status; } public LocalDate validFrom() { return validFrom; } public LocalDate validTo() { return validTo; }
}
