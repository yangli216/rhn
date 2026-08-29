package com.rhn.platform.dictionary.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "dictionary_attribute_definitions")
public class DictionaryAttributeDefinition {
    @Id
    private Long id;
    @Version
    @Column(nullable = false)
    private Long revision;
    @Column(name = "dictionary_id", nullable = false)
    private Long dictionaryId;
    @Column(nullable = false, length = 64)
    private String code;
    @Column(nullable = false, length = 200)
    private String name;
    @Column(nullable = false, length = 1000)
    private String description;
    @Enumerated(EnumType.STRING)
    @Column(name = "data_type", nullable = false, length = 32)
    private DictionaryAttributeDataType dataType;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private DictionaryAttributeCardinality cardinality;
    @Column(name = "reference_dictionary_id")
    private Long referenceDictionaryId;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "schema_json", nullable = false)
    private String schemaJson;
    @Enumerated(EnumType.STRING)
    @Column(name = "minimum_scope", nullable = false, length = 32)
    private DictionaryAttributeScopeType minimumScope;
    @Enumerated(EnumType.STRING)
    @Column(name = "override_policy", nullable = false, length = 32)
    private DictionaryAttributeOverridePolicy overridePolicy;
    @Column(name = "required_value", nullable = false)
    private boolean requiredValue;
    @Column(nullable = false)
    private boolean searchable;
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

    protected DictionaryAttributeDefinition() {
    }

    public DictionaryAttributeDefinition(Long dictionaryId, String code, String name, String description,
                                         DictionaryAttributeDataType dataType,
                                         DictionaryAttributeCardinality cardinality,
                                         Long referenceDictionaryId, String schemaJson,
                                         DictionaryAttributeScopeType minimumScope,
                                         DictionaryAttributeOverridePolicy overridePolicy,
                                         boolean requiredValue, boolean searchable, Long actorId) {
        this.id = GlobalIds.next();
        this.revision = null;
        this.dictionaryId = requireId(dictionaryId, "字典");
        this.code = DictionaryCodePolicy.requireItemCode(code);
        apply(name, description, dataType, cardinality, referenceDictionaryId, schemaJson,
                minimumScope, overridePolicy, requiredValue, searchable);
        this.status = DictionaryStatus.ACTIVE;
        this.createdAt = Instant.now();
        this.createdBy = requireId(actorId, "操作用户");
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    public void update(String name, String description, DictionaryAttributeDataType dataType,
                       DictionaryAttributeCardinality cardinality, Long referenceDictionaryId,
                       String schemaJson, DictionaryAttributeScopeType minimumScope,
                       DictionaryAttributeOverridePolicy overridePolicy, boolean requiredValue,
                       boolean searchable, Long actorId) {
        apply(name, description, dataType, cardinality, referenceDictionaryId, schemaJson,
                minimumScope, overridePolicy, requiredValue, searchable);
        touch(actorId);
    }

    public void changeStatus(DictionaryStatus target, Long actorId) {
        if (target == null || target == status) throw new IllegalArgumentException("属性定义状态没有变化");
        this.status = target;
        touch(actorId);
    }

    private void apply(String name, String description, DictionaryAttributeDataType dataType,
                       DictionaryAttributeCardinality cardinality, Long referenceDictionaryId,
                       String schemaJson, DictionaryAttributeScopeType minimumScope,
                       DictionaryAttributeOverridePolicy overridePolicy, boolean requiredValue,
                       boolean searchable) {
        this.name = requireText(name, "属性名称", 200);
        this.description = requireText(description, "属性说明", 1000);
        if (dataType == null) throw new IllegalArgumentException("属性数据类型不能为空");
        if (cardinality == null) throw new IllegalArgumentException("属性基数不能为空");
        if (minimumScope == null) throw new IllegalArgumentException("最低自定义层级不能为空");
        if (overridePolicy == null) throw new IllegalArgumentException("覆盖策略不能为空");
        if (dataType == DictionaryAttributeDataType.DICT_REF) requireId(referenceDictionaryId, "引用值域字典");
        if (dataType != DictionaryAttributeDataType.DICT_REF && referenceDictionaryId != null) {
            throw new IllegalArgumentException("仅字典引用类型允许配置引用值域");
        }
        if (overridePolicy == DictionaryAttributeOverridePolicy.NO_OVERRIDE
                && minimumScope != DictionaryAttributeScopeType.PLATFORM) {
            throw new IllegalArgumentException("禁止覆盖的属性只能在平台层维护");
        }
        this.dataType = dataType;
        this.cardinality = cardinality;
        this.referenceDictionaryId = referenceDictionaryId;
        this.schemaJson = requireText(schemaJson, "属性值模式", 16000);
        this.minimumScope = minimumScope;
        this.overridePolicy = overridePolicy;
        this.requiredValue = requiredValue;
        this.searchable = searchable;
    }

    private void touch(Long actorId) {
        this.updatedAt = Instant.now();
        this.updatedBy = requireId(actorId, "操作用户");
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

    public Long id() { return id; }
    public Long revision() { return revision; }
    public Long dictionaryId() { return dictionaryId; }
    public String code() { return code; }
    public String name() { return name; }
    public String description() { return description; }
    public DictionaryAttributeDataType dataType() { return dataType; }
    public DictionaryAttributeCardinality cardinality() { return cardinality; }
    public Long referenceDictionaryId() { return referenceDictionaryId; }
    public String schemaJson() { return schemaJson; }
    public DictionaryAttributeScopeType minimumScope() { return minimumScope; }
    public DictionaryAttributeOverridePolicy overridePolicy() { return overridePolicy; }
    public boolean requiredValue() { return requiredValue; }
    public boolean searchable() { return searchable; }
    public DictionaryStatus status() { return status; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public Long updatedBy() { return updatedBy; }
}
