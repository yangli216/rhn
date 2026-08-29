package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "item_attribute_changes")
public class ItemAttributeChange {
    @Id private Long id;
    @Column(name = "tenant_id") private Long tenantId;
    @Column(name = "attribute_definition_id", nullable = false) private Long attributeDefinitionId;
    @Column(name = "item_type_id") private Long itemTypeId;
    @Column(name = "item_type_attribute_id") private Long itemTypeAttributeId;
    @Column(name = "attribute_subject_id") private Long attributeSubjectId;
    @Column(name = "attribute_value_id") private Long attributeValueId;
    @Column(name = "attribute_override_id") private Long attributeOverrideId;
    @Column(name = "target_type", nullable = false) private String targetType;
    @Column(name = "change_type", nullable = false) private String changeType;
    @Column(name = "scope_key") private String scopeKey;
    @Lob @Column(name = "before_json") private String beforeJson;
    @Lob @Column(name = "after_json") private String afterJson;
    @Column(name = "change_reason", nullable = false) private String changeReason;
    @Column(name = "request_code", nullable = false) private String requestCode;
    @Column(name = "changed_at", nullable = false) private Instant changedAt;
    @Column(name = "changed_by", nullable = false) private Long changedBy;

    protected ItemAttributeChange() {}

    public ItemAttributeChange(Long tenantId, Long definitionId, Long subjectId, Long valueId,
                               Long overrideId, String targetType, String changeType, String scopeKey,
                               String beforeJson, String afterJson, String reason, String requestCode,
                               Long actorId) {
        this(tenantId, definitionId, null, null, subjectId, valueId, overrideId, targetType, changeType,
                scopeKey, beforeJson, afterJson, reason, requestCode, actorId);
    }

    public static ItemAttributeChange definition(Long tenantId, Long definitionId, String changeType,
                                                 String beforeJson, String afterJson, String reason,
                                                 String requestCode, Long actorId) {
        return new ItemAttributeChange(tenantId, definitionId, null, null, null, null, null,
                "DEFINITION", changeType, "TENANT:" + tenantId, beforeJson, afterJson,
                reason, requestCode, actorId);
    }

    public static ItemAttributeChange assignment(Long tenantId, Long definitionId, Long itemTypeId,
                                                 Long assignmentId, String changeType, String beforeJson,
                                                 String afterJson, String reason, String requestCode, Long actorId) {
        return new ItemAttributeChange(tenantId, definitionId, itemTypeId, assignmentId, null, null, null,
                "TYPE_ASSIGNMENT", changeType, "ITEM_TYPE:" + itemTypeId, beforeJson, afterJson,
                reason, requestCode, actorId);
    }

    private ItemAttributeChange(Long tenantId, Long definitionId, Long itemTypeId, Long assignmentId,
                                Long subjectId, Long valueId, Long overrideId, String targetType,
                                String changeType, String scopeKey, String beforeJson, String afterJson,
                                String reason, String requestCode, Long actorId) {
        if (beforeJson == null && afterJson == null) throw new IllegalArgumentException("属性变更快照不能为空");
        this.id = GlobalIds.next();
        this.tenantId = requireId(tenantId, "租户");
        this.attributeDefinitionId = requireId(definitionId, "属性定义");
        this.itemTypeId = itemTypeId;
        this.itemTypeAttributeId = assignmentId;
        this.attributeSubjectId = subjectId;
        this.attributeValueId = valueId;
        this.attributeOverrideId = overrideId;
        this.targetType = requireText(targetType, "变更目标", 32);
        this.changeType = requireText(changeType, "变更类型", 32);
        this.scopeKey = optionalText(scopeKey, 512);
        this.beforeJson = beforeJson;
        this.afterJson = afterJson;
        this.changeReason = requireText(reason, "变更原因", 1000);
        this.requestCode = requireText(requestCode, "请求编码", 128);
        this.changedAt = Instant.now();
        this.changedBy = requireId(actorId, "操作用户");
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long attributeDefinitionId() { return attributeDefinitionId; }
    public Long itemTypeId() { return itemTypeId; }
    public Long itemTypeAttributeId() { return itemTypeAttributeId; }
    public Long attributeSubjectId() { return attributeSubjectId; }
    public Long attributeValueId() { return attributeValueId; }
    public Long attributeOverrideId() { return attributeOverrideId; }
    public String targetType() { return targetType; }
    public String changeType() { return changeType; }
    public String scopeKey() { return scopeKey; }
    public String beforeJson() { return beforeJson; }
    public String afterJson() { return afterJson; }
    public String changeReason() { return changeReason; }
    public String requestCode() { return requestCode; }
    public Instant changedAt() { return changedAt; }
    public Long changedBy() { return changedBy; }

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

    private static String optionalText(String value, int max) {
        if (value == null || value.isBlank()) return null;
        String result = value.trim();
        if (result.length() > max) throw new IllegalArgumentException("文本长度不能超过" + max);
        return result;
    }
}
