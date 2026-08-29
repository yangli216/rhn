package com.rhn.platform.dictionary.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "dictionary_changes")
public class DictionaryChange {
    @Id
    private Long id;
    @Column(name = "tenant_id")
    private Long tenantId;
    @Column(name = "category_id")
    private Long categoryId;
    @Column(name = "dictionary_id")
    private Long dictionaryId;
    @Column(name = "item_id")
    private Long itemId;
    @Column(name = "attribute_definition_id")
    private Long attributeDefinitionId;
    @Enumerated(EnumType.STRING)
    @Column(name = "change_type", nullable = false, length = 32)
    private DictionaryChangeType changeType;
    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", nullable = false, length = 16)
    private DictionaryChangeTargetType targetType;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "before_json")
    private String beforeJson;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "after_json")
    private String afterJson;
    @Column(length = 1000)
    private String reason;
    @Column(name = "request_code", nullable = false, length = 128)
    private String requestCode;
    @Column(name = "changed_at", nullable = false)
    private Instant changedAt;
    @Column(name = "changed_by", nullable = false)
    private Long changedBy;

    protected DictionaryChange() {
    }

    public DictionaryChange(DictionaryDefinition definition, Long itemId, DictionaryChangeType changeType,
                            String beforeJson, String afterJson, String reason,
                            String requestCode, Long actorId) {
        if (beforeJson == null && afterJson == null) throw new IllegalArgumentException("变更快照不能为空");
        if (requestCode == null || requestCode.isBlank()) throw new IllegalArgumentException("请求编码不能为空");
        String normalizedRequestCode = requestCode.trim();
        if (normalizedRequestCode.length() > 128) throw new IllegalArgumentException("请求编码长度不能超过128");
        this.id = GlobalIds.next();
        this.tenantId = definition.tenantId();
        this.categoryId = definition.categoryId();
        this.dictionaryId = definition.id();
        this.itemId = itemId;
        this.attributeDefinitionId = null;
        this.changeType = changeType;
        this.targetType = itemId == null ? DictionaryChangeTargetType.DICT : DictionaryChangeTargetType.ITEM;
        this.beforeJson = beforeJson;
        this.afterJson = afterJson;
        this.reason = reason == null || reason.isBlank() ? null : reason.trim();
        this.requestCode = normalizedRequestCode;
        this.changedAt = Instant.now();
        this.changedBy = actorId;
    }

    public DictionaryChange(DictionaryCategory category, DictionaryChangeType changeType,
                            String beforeJson, String afterJson, String reason,
                            String requestCode, Long actorId) {
        if (beforeJson == null && afterJson == null) throw new IllegalArgumentException("变更快照不能为空");
        if (requestCode == null || requestCode.isBlank()) throw new IllegalArgumentException("请求编码不能为空");
        String normalizedRequestCode = requestCode.trim();
        if (normalizedRequestCode.length() > 128) throw new IllegalArgumentException("请求编码长度不能超过128");
        this.id = GlobalIds.next();
        this.tenantId = category.tenantId();
        this.categoryId = category.id();
        this.dictionaryId = null;
        this.itemId = null;
        this.attributeDefinitionId = null;
        this.changeType = changeType;
        this.targetType = DictionaryChangeTargetType.CATEGORY;
        this.beforeJson = beforeJson;
        this.afterJson = afterJson;
        this.reason = reason == null || reason.isBlank() ? null : reason.trim();
        this.requestCode = normalizedRequestCode;
        this.changedAt = Instant.now();
        this.changedBy = actorId;
    }

    public DictionaryChange(DictionaryDefinition definition, Long itemId, Long attributeDefinitionId,
                            DictionaryChangeType changeType, DictionaryChangeTargetType targetType,
                            String beforeJson, String afterJson, String reason,
                            String requestCode, Long actorId) {
        if (beforeJson == null && afterJson == null) throw new IllegalArgumentException("变更快照不能为空");
        if (requestCode == null || requestCode.isBlank()) throw new IllegalArgumentException("请求编码不能为空");
        if (attributeDefinitionId == null) throw new IllegalArgumentException("属性定义标识不能为空");
        if (targetType != DictionaryChangeTargetType.ATTR_DEFINITION
                && targetType != DictionaryChangeTargetType.ITEM_ATTRIBUTE) {
            throw new IllegalArgumentException("属性变更目标类型不正确");
        }
        if (targetType == DictionaryChangeTargetType.ITEM_ATTRIBUTE && itemId == null) {
            throw new IllegalArgumentException("字典项属性变更必须关联字典项");
        }
        String normalizedRequestCode = requestCode.trim();
        if (normalizedRequestCode.length() > 128) throw new IllegalArgumentException("请求编码长度不能超过128");
        this.id = GlobalIds.next();
        this.tenantId = definition.tenantId();
        this.categoryId = definition.categoryId();
        this.dictionaryId = definition.id();
        this.itemId = itemId;
        this.attributeDefinitionId = attributeDefinitionId;
        this.changeType = changeType;
        this.targetType = targetType;
        this.beforeJson = beforeJson;
        this.afterJson = afterJson;
        this.reason = reason == null || reason.isBlank() ? null : reason.trim();
        this.requestCode = normalizedRequestCode;
        this.changedAt = Instant.now();
        this.changedBy = actorId;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long categoryId() { return categoryId; }
    public Long dictionaryId() { return dictionaryId; }
    public Long itemId() { return itemId; }
    public Long attributeDefinitionId() { return attributeDefinitionId; }
    public DictionaryChangeType changeType() { return changeType; }
    public DictionaryChangeTargetType targetType() { return targetType; }
    public String beforeJson() { return beforeJson; }
    public String afterJson() { return afterJson; }
    public String reason() { return reason; }
    public String requestCode() { return requestCode; }
    public Instant changedAt() { return changedAt; }
    public Long changedBy() { return changedBy; }
}
