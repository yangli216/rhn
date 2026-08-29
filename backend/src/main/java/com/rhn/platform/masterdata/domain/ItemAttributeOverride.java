package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.LocalDate;
import java.time.Instant;

@Entity
@Table(name = "item_attribute_overrides")
public class ItemAttributeOverride {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "attribute_subject_id", nullable = false) private Long attributeSubjectId;
    @Column(name = "attribute_definition_id", nullable = false) private Long attributeDefinitionId;
    @Column(name = "scope_type", nullable = false) private String scopeType;
    @Column(name = "scope_key", nullable = false) private String scopeKey;
    @Column(name = "organization_id") private Long organizationId;
    @Column(name = "department_id") private Long departmentId;
    @Column(name = "value_mode", nullable = false) private String valueMode;
    @Lob @Column(name = "value_json") private String valueJson;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected ItemAttributeOverride() {}

    public ItemAttributeOverride(Long tenantId, Long attributeSubjectId, Long attributeDefinitionId,
                                 String scopeType, String scopeKey, Long organizationId, Long departmentId,
                                 String valueMode, String valueJson, LocalDate validFrom, LocalDate validTo,
                                 Long actorId) {
        requirePeriod(validFrom, validTo);
        this.id = GlobalIds.next();
        this.tenantId = requireId(tenantId, "租户");
        this.attributeSubjectId = requireId(attributeSubjectId, "属性主体");
        this.attributeDefinitionId = requireId(attributeDefinitionId, "属性定义");
        applyScope(scopeType, scopeKey, organizationId, departmentId);
        applyValue(valueMode, valueJson);
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.status = "ACTIVE";
        this.createdAt = Instant.now();
        this.createdBy = requireId(actorId, "操作用户");
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    public void update(long expectedRevision, String valueMode, String valueJson,
                       LocalDate validFrom, LocalDate validTo, Long actorId) {
        if (revision != expectedRevision) throw new IllegalArgumentException("属性覆盖值修订号已变化");
        requirePeriod(validFrom, validTo);
        applyValue(valueMode, valueJson);
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.status = "ACTIVE";
        this.updatedAt = Instant.now();
        this.updatedBy = requireId(actorId, "操作用户");
    }

    public void disable(long expectedRevision, Long actorId) {
        if (revision != expectedRevision) throw new IllegalArgumentException("属性覆盖值修订号已变化");
        this.status = "INACTIVE";
        this.updatedAt = Instant.now();
        this.updatedBy = requireId(actorId, "操作用户");
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long attributeSubjectId() { return attributeSubjectId; }
    public Long attributeDefinitionId() { return attributeDefinitionId; }
    public String scopeType() { return scopeType; }
    public String scopeKey() { return scopeKey; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public String valueMode() { return valueMode; }
    public String valueJson() { return valueJson; }
    public LocalDate validFrom() { return validFrom; }
    public LocalDate validTo() { return validTo; }
    public String status() { return status; }

    private void applyScope(String type, String key, Long organizationId, Long departmentId) {
        if (!"TENANT".equals(type) && !"ORGANIZATION".equals(type) && !"DEPARTMENT".equals(type)) {
            throw new IllegalArgumentException("不支持的属性覆盖作用域");
        }
        if ("TENANT".equals(type) && (organizationId != null || departmentId != null)) {
            throw new IllegalArgumentException("租户覆盖不能指定机构或科室");
        }
        if ("ORGANIZATION".equals(type) && (organizationId == null || departmentId != null)) {
            throw new IllegalArgumentException("机构覆盖必须且只能指定机构");
        }
        if ("DEPARTMENT".equals(type) && (organizationId == null || departmentId == null)) {
            throw new IllegalArgumentException("科室覆盖必须指定机构和科室");
        }
        this.scopeType = type;
        this.scopeKey = requireText(key, "作用域编码", 512);
        this.organizationId = organizationId;
        this.departmentId = departmentId;
    }

    private void applyValue(String mode, String json) {
        if (!"OVERRIDE".equals(mode) && !"EXPLICIT_NULL".equals(mode)) {
            throw new IllegalArgumentException("不支持的属性覆盖值模式");
        }
        if ("OVERRIDE".equals(mode)) this.valueJson = requireText(json, "属性覆盖值", 20000);
        else if (json != null) throw new IllegalArgumentException("显式空值不能携带属性内容");
        else this.valueJson = null;
        this.valueMode = mode;
    }

    private static void requirePeriod(LocalDate from, LocalDate to) {
        if (from == null) throw new IllegalArgumentException("生效日期不能为空");
        if (to != null && to.isBefore(from)) throw new IllegalArgumentException("失效日期不能早于生效日期");
    }

    private static Long requireId(Long value, String label) {
        if (value == null || value <= 0) throw new IllegalArgumentException(label + "标识不能为空");
        return value;
    }

    private static String requireText(String value, String label, int max) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + "不能为空");
        String result = value.trim();
        if (result.length() > max) throw new IllegalArgumentException(label + "长度不能超过" + max);
        return result;
    }
}
