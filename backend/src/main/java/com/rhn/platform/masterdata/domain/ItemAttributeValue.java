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
@Table(name = "item_attribute_values")
public class ItemAttributeValue {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "scope_type", nullable = false) private String scopeType;
    @Column(name = "scope_code", nullable = false) private String scopeCode;
    @Column(name = "tenant_id") private Long tenantId;
    @Column(name = "attribute_subject_id", nullable = false) private Long attributeSubjectId;
    @Column(name = "attribute_definition_id", nullable = false) private Long attributeDefinitionId;
    @Lob @Column(name = "value_json", nullable = false) private String valueJson;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected ItemAttributeValue() {}

    public ItemAttributeValue(Long tenantId, Long attributeSubjectId, Long attributeDefinitionId,
                              String valueJson, LocalDate validFrom, LocalDate validTo, Long actorId) {
        requirePeriod(validFrom, validTo);
        this.id = GlobalIds.next();
        this.scopeType = "TENANT";
        this.scopeCode = "TENANT:" + requireId(tenantId, "租户");
        this.tenantId = tenantId;
        this.attributeSubjectId = requireId(attributeSubjectId, "属性主体");
        this.attributeDefinitionId = requireId(attributeDefinitionId, "属性定义");
        this.valueJson = requireText(valueJson, "属性值", 20000);
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.status = "ACTIVE";
        this.createdAt = Instant.now();
        this.createdBy = requireId(actorId, "操作用户");
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    public void update(long expectedRevision, String valueJson, LocalDate validFrom,
                       LocalDate validTo, Long actorId) {
        if (revision != expectedRevision) throw new IllegalArgumentException("属性值修订号已变化");
        requirePeriod(validFrom, validTo);
        this.valueJson = requireText(valueJson, "属性值", 20000);
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.status = "ACTIVE";
        this.updatedAt = Instant.now();
        this.updatedBy = requireId(actorId, "操作用户");
    }

    public void disable(long expectedRevision, Long actorId) {
        if (revision != expectedRevision) throw new IllegalArgumentException("属性值修订号已变化");
        this.status = "INACTIVE";
        this.updatedAt = Instant.now();
        this.updatedBy = requireId(actorId, "操作用户");
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public String scopeType() { return scopeType; }
    public String scopeCode() { return scopeCode; }
    public Long tenantId() { return tenantId; }
    public Long attributeSubjectId() { return attributeSubjectId; }
    public Long attributeDefinitionId() { return attributeDefinitionId; }
    public String valueJson() { return valueJson; }
    public LocalDate validFrom() { return validFrom; }
    public LocalDate validTo() { return validTo; }
    public String status() { return status; }

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
        if (value.length() > max) throw new IllegalArgumentException(label + "长度不能超过" + max);
        return value;
    }
}
