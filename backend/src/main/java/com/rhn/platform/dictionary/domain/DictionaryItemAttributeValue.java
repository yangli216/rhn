package com.rhn.platform.dictionary.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "dictionary_item_attribute_values")
public class DictionaryItemAttributeValue {
    @Id
    private Long id;
    @Column(name = "dictionary_item_id", nullable = false)
    private Long dictionaryItemId;
    @Column(name = "attribute_definition_id", nullable = false)
    private Long attributeDefinitionId;
    @Enumerated(EnumType.STRING)
    @Column(name = "scope_type", nullable = false, length = 32)
    private DictionaryAttributeScopeType scopeType;
    @Column(name = "scope_code", nullable = false, length = 512)
    private String scopeCode;
    @Column(name = "tenant_id")
    private Long tenantId;
    @Column(name = "organization_id")
    private Long organizationId;
    @Column(name = "department_id")
    private Long departmentId;
    @Column(name = "value_order", nullable = false)
    private int valueOrder;
    @Enumerated(EnumType.STRING)
    @Column(name = "value_mode", nullable = false, length = 32)
    private DictionaryAttributeValueMode valueMode;
    @Column(name = "boolean_value")
    private Boolean booleanValue;
    @Column(name = "integer_value")
    private Long integerValue;
    @Column(name = "decimal_value", precision = 28, scale = 8)
    private BigDecimal decimalValue;
    @Column(name = "text_value", length = 4000)
    private String textValue;
    @Column(name = "code_value", length = 256)
    private String codeValue;
    @Column(name = "date_value")
    private LocalDate dateValue;
    @Column(name = "datetime_value")
    private Instant datetimeValue;
    @Column(name = "reference_item_id")
    private Long referenceItemId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private DictionaryStatus status;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "created_by", nullable = false)
    private Long createdBy;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    @Column(name = "updated_by", nullable = false)
    private Long updatedBy;

    protected DictionaryItemAttributeValue() {
    }

    public DictionaryItemAttributeValue(Long dictionaryItemId, Long attributeDefinitionId,
                                        DictionaryAttributeScopeType scopeType, String scopeCode,
                                        Long tenantId, Long organizationId, Long departmentId,
                                        int valueOrder, DictionaryAttributeValueMode valueMode,
                                        Boolean booleanValue, Long integerValue, BigDecimal decimalValue,
                                        String textValue, String codeValue, LocalDate dateValue,
                                        Instant datetimeValue, Long referenceItemId, Long actorId) {
        this.id = GlobalIds.next();
        this.dictionaryItemId = requireId(dictionaryItemId, "字典项");
        this.attributeDefinitionId = requireId(attributeDefinitionId, "属性定义");
        this.scopeType = require(scopeType, "配置作用域");
        this.scopeCode = requireText(scopeCode, "规范作用域编码", 512);
        this.tenantId = tenantId;
        this.organizationId = organizationId;
        this.departmentId = departmentId;
        this.valueOrder = valueOrder;
        this.valueMode = require(valueMode, "值模式");
        this.booleanValue = booleanValue;
        this.integerValue = integerValue;
        this.decimalValue = decimalValue;
        this.textValue = optionalText(textValue, 4000);
        this.codeValue = optionalText(codeValue, 256);
        this.dateValue = dateValue;
        this.datetimeValue = datetimeValue;
        this.referenceItemId = referenceItemId;
        validateShape();
        this.status = DictionaryStatus.ACTIVE;
        this.createdAt = Instant.now();
        this.createdBy = requireId(actorId, "操作用户");
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    private void validateShape() {
        if (valueOrder < 0) throw new IllegalArgumentException("属性值顺序不能小于0");
        switch (scopeType) {
            case PLATFORM -> {
                if (tenantId != null || organizationId != null || departmentId != null) invalidScope();
            }
            case TENANT -> {
                requireId(tenantId, "租户");
                if (organizationId != null || departmentId != null) invalidScope();
            }
            case ORGANIZATION -> {
                requireId(tenantId, "租户"); requireId(organizationId, "机构");
                if (departmentId != null) invalidScope();
            }
            case DEPARTMENT -> {
                requireId(tenantId, "租户"); requireId(organizationId, "机构"); requireId(departmentId, "科室");
            }
        }
        int populated = (booleanValue == null ? 0 : 1) + (integerValue == null ? 0 : 1)
                + (decimalValue == null ? 0 : 1) + (textValue == null ? 0 : 1)
                + (codeValue == null ? 0 : 1) + (dateValue == null ? 0 : 1)
                + (datetimeValue == null ? 0 : 1) + (referenceItemId == null ? 0 : 1);
        if (valueMode == DictionaryAttributeValueMode.EXPLICIT_EMPTY) {
            if (valueOrder != 0 || populated != 0) throw new IllegalArgumentException("显式空集不能携带属性值");
        } else if (populated != 1) {
            throw new IllegalArgumentException("覆盖值必须且只能填写一个类型化值");
        }
    }

    private static void invalidScope() {
        throw new IllegalArgumentException("作用域来源标识与作用域类型不匹配");
    }

    private static Long requireId(Long value, String label) {
        if (value == null || value <= 0) throw new IllegalArgumentException(label + "标识不能为空");
        return value;
    }

    private static <T> T require(T value, String label) {
        if (value == null) throw new IllegalArgumentException(label + "不能为空");
        return value;
    }

    private static String requireText(String value, String label, int max) {
        String result = optionalText(value, max);
        if (result == null) throw new IllegalArgumentException(label + "不能为空");
        return result;
    }

    private static String optionalText(String value, int max) {
        if (value == null || value.isBlank()) return null;
        String result = value.trim();
        if (result.length() > max) throw new IllegalArgumentException("文本长度不能超过" + max);
        return result;
    }

    public Long id() { return id; }
    public Long dictionaryItemId() { return dictionaryItemId; }
    public Long attributeDefinitionId() { return attributeDefinitionId; }
    public DictionaryAttributeScopeType scopeType() { return scopeType; }
    public String scopeCode() { return scopeCode; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public int valueOrder() { return valueOrder; }
    public DictionaryAttributeValueMode valueMode() { return valueMode; }
    public Boolean booleanValue() { return booleanValue; }
    public Long integerValue() { return integerValue; }
    public BigDecimal decimalValue() { return decimalValue; }
    public String textValue() { return textValue; }
    public String codeValue() { return codeValue; }
    public LocalDate dateValue() { return dateValue; }
    public Instant datetimeValue() { return datetimeValue; }
    public Long referenceItemId() { return referenceItemId; }
    public DictionaryStatus status() { return status; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public Long updatedBy() { return updatedBy; }
}
