package com.rhn.platform.configuration.domain;

import com.rhn.shared.api.StaleRevisionException;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.text.Strings;
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
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

@Entity
@Table(name = "parameter_definitions")
public class ConfigurationDefinition {
    @Id private Long id;
    @Column(name = "category_id", nullable = false) private Long categoryId;
    @Column(name = "parameter_key", nullable = false, length = 160) private String configKey;
    @Column(nullable = false, length = 200) private String name;
    @Column(length = 1000) private String description;
    @Enumerated(EnumType.STRING) @Column(name = "value_type", nullable = false, length = 24)
    private ConfigurationValueType valueType;
    @Enumerated(EnumType.STRING) @Column(name = "control_type", nullable = false, length = 32)
    private ConfigurationControlType controlType;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR) @Column(name = "json_schema") private String jsonSchema;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR) @Column(name = "default_value_json") private String defaultValueJson;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR) @Column(name = "example_value_json") private String exampleValueJson;
    @Column(length = 32) private String unit;
    @Column(name = "dictionary_code", length = 64) private String dictionaryCode;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR) @Column(name = "scope_json", nullable = false) private String scopeJson;
    @Enumerated(EnumType.STRING) @Column(name = "parameter_category", nullable = false, length = 24)
    private ConfigurationCategory category;
    @Column(name = "inheritance_enabled", nullable = false) private boolean inheritanceEnabled;
    @Column(name = "cache_enabled", nullable = false) private boolean cacheEnabled;
    @Column(name = "nullable_value", nullable = false) private boolean nullableValue;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 24)
    private ConfigurationSensitivity sensitivity;
    @Enumerated(EnumType.STRING) @Column(name = "display_policy", nullable = false, length = 24)
    private ConfigurationDisplayPolicy displayPolicy;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private ConfigurationStatus status;
    @Version @Column(nullable = false) private Long revision;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected ConfigurationDefinition() {
    }

    public ConfigurationDefinition(Long categoryId, String configKey, String name, String description,
                                   ConfigurationValueType valueType, ConfigurationControlType controlType,
                                   String jsonSchema, String defaultValueJson, String exampleValueJson,
                                   String unit, String dictionaryCode, Set<ConfigurationScope> allowedScopes,
                                   ConfigurationCategory category, boolean inheritanceEnabled,
                                   boolean cacheEnabled, boolean nullableValue,
                                   ConfigurationSensitivity sensitivity,
                                   ConfigurationDisplayPolicy displayPolicy, Long actorId) {
        this.id = GlobalIds.next();
        this.revision = null;
        apply(categoryId, name, description, valueType, controlType, jsonSchema, defaultValueJson,
                exampleValueJson, unit, dictionaryCode, allowedScopes, category, inheritanceEnabled,
                cacheEnabled, nullableValue, sensitivity, displayPolicy);
        this.configKey = ConfigurationCodePolicy.requireParameterKey(configKey);
        this.status = ConfigurationStatus.ACTIVE;
        this.createdAt = Instant.now();
        this.createdBy = Strings.requireId(actorId, "操作用户");
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    public void update(long expectedRevision, Long categoryId, String name, String description,
                       ConfigurationValueType valueType, ConfigurationControlType controlType,
                       String jsonSchema, String defaultValueJson, String exampleValueJson,
                       String unit, String dictionaryCode, Set<ConfigurationScope> allowedScopes,
                       ConfigurationCategory category, boolean inheritanceEnabled,
                       boolean cacheEnabled, boolean nullableValue,
                       ConfigurationSensitivity sensitivity,
                       ConfigurationDisplayPolicy displayPolicy, Long actorId) {
        assertRevision(expectedRevision);
        apply(categoryId, name, description, valueType, controlType, jsonSchema, defaultValueJson,
                exampleValueJson, unit, dictionaryCode, allowedScopes, category, inheritanceEnabled,
                cacheEnabled, nullableValue, sensitivity, displayPolicy);
        touch(actorId);
    }

    public void changeStatus(long expectedRevision, boolean enabled, Long actorId) {
        assertRevision(expectedRevision);
        ConfigurationStatus target = enabled ? ConfigurationStatus.ACTIVE : ConfigurationStatus.INACTIVE;
        if (status == target) throw new IllegalArgumentException("参数定义已经处于" + target + "状态");
        status = target;
        touch(actorId);
    }

    public void assertRevision(long expectedRevision) {
        if (revision == null || revision != expectedRevision) {
            throw new StaleRevisionException(revision, "参数已被其他操作更新，请刷新后重试");
        }
    }

    private void apply(Long categoryId, String name, String description,
                       ConfigurationValueType valueType, ConfigurationControlType controlType,
                       String jsonSchema, String defaultValueJson, String exampleValueJson,
                       String unit, String dictionaryCode, Set<ConfigurationScope> allowedScopes,
                       ConfigurationCategory category, boolean inheritanceEnabled,
                       boolean cacheEnabled, boolean nullableValue,
                       ConfigurationSensitivity sensitivity,
                       ConfigurationDisplayPolicy displayPolicy) {
        this.categoryId = Strings.requireId(categoryId, "参数分类");
        this.name = Strings.requireText(name, "参数名称", 200);
        this.description = Strings.optionalText(description, 1000);
        this.valueType = Strings.require(valueType, "参数值类型");
        this.controlType = Strings.require(controlType, "界面控件类型");
        this.jsonSchema = Strings.optionalText(jsonSchema, 10000);
        this.defaultValueJson = Strings.optionalText(defaultValueJson, 10000);
        this.exampleValueJson = Strings.optionalText(exampleValueJson, 10000);
        this.unit = Strings.optionalText(unit, 32);
        this.dictionaryCode = Strings.optionalText(dictionaryCode, 64);
        this.scopeJson = scopesJson(allowedScopes);
        this.category = Strings.require(category, "参数配置属性");
        this.inheritanceEnabled = inheritanceEnabled;
        this.cacheEnabled = cacheEnabled;
        this.nullableValue = nullableValue;
        this.sensitivity = Strings.require(sensitivity, "敏感级别");
        this.displayPolicy = Strings.require(displayPolicy, "展示策略");
    }

    private void touch(Long actorId) {
        updatedAt = Instant.now();
        updatedBy = Strings.requireId(actorId, "操作用户");
    }

    private static String scopesJson(Set<ConfigurationScope> scopes) {
        if (scopes == null || scopes.isEmpty()) throw new IllegalArgumentException("至少需要允许一个参数作用域");
        return scopes.stream().sorted().map(scope -> "\"" + scope.name() + "\"")
                .collect(Collectors.joining(",", "[", "]"));
    }

    public Set<ConfigurationScope> allowedScopes() {
        if (scopeJson == null || scopeJson.length() < 2) return Set.of();
        String content = scopeJson.substring(1, scopeJson.length() - 1);
        if (content.isBlank()) return Set.of();
        return Arrays.stream(content.split(",")).map(value -> value.replace("\"", "").trim())
                .map(ConfigurationScope::valueOf).collect(Collectors.toUnmodifiableSet());
    }

    public boolean allows(ConfigurationScope scope) { return allowedScopes().contains(scope); }

    public Long id() { return id; }
    public Long revision() { return revision; }
    public Long categoryId() { return categoryId; }
    public String configKey() { return configKey; }
    public String name() { return name; }
    public String description() { return description; }
    public ConfigurationValueType valueType() { return valueType; }
    public ConfigurationControlType controlType() { return controlType; }
    public String jsonSchema() { return jsonSchema; }
    public String defaultValueJson() { return defaultValueJson; }
    public String exampleValueJson() { return exampleValueJson; }
    public String unit() { return unit; }
    public String dictionaryCode() { return dictionaryCode; }
    public String scopeJson() { return scopeJson; }
    public ConfigurationCategory category() { return category; }
    public boolean inheritanceEnabled() { return inheritanceEnabled; }
    public boolean cacheEnabled() { return cacheEnabled; }
    public boolean nullableValue() { return nullableValue; }
    public ConfigurationSensitivity sensitivity() { return sensitivity; }
    public ConfigurationDisplayPolicy displayPolicy() { return displayPolicy; }
    public ConfigurationStatus status() { return status; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public Long updatedBy() { return updatedBy; }
}
