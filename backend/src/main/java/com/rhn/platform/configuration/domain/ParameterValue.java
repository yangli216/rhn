package com.rhn.platform.configuration.domain;

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
@Table(name = "parameter_values")
public class ParameterValue {
    @Id private Long id;
    @Column(name = "definition_id", nullable = false) private Long definitionId;
    @Column(name = "tenant_id") private Long tenantId;
    @Enumerated(EnumType.STRING) @Column(name = "scope_type", nullable = false, length = 24)
    private ConfigurationScope scopeType;
    @Column(name = "scope_id") private Long scopeId;
    @Column(name = "scope_reference", length = 128) private String scopeReference;
    @Column(name = "scope_code", nullable = false, length = 200) private String scopeCode;
    @Enumerated(EnumType.STRING) @Column(name = "value_mode", nullable = false, length = 24)
    private ConfigurationValueMode valueMode;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR) @Column(name = "value_json") private String valueJson;
    @Column(name = "secret_ref", length = 500) private String secretRef;
    @Column(nullable = false) private boolean active;
    @Version @Column(nullable = false) private Long revision;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected ParameterValue() {
    }

    public ParameterValue(Long definitionId, Long tenantId, ConfigurationScope scopeType,
                          Long scopeId, String scopeReference, String scopeCode,
                          ConfigurationValueMode valueMode, String valueJson, String secretRef,
                          Long actorId) {
        this.id = GlobalIds.next();
        this.revision = null;
        this.definitionId = requireId(definitionId, "参数定义");
        this.tenantId = tenantId;
        this.scopeType = require(scopeType, "参数作用域");
        this.scopeId = scopeId;
        this.scopeReference = optionalText(scopeReference, 128);
        this.scopeCode = requireText(scopeCode, "作用域编码", 200);
        applyContent(valueMode, valueJson, secretRef);
        this.active = true;
        this.createdAt = Instant.now();
        this.createdBy = requireId(actorId, "操作用户");
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    public void update(long expectedRevision, ConfigurationValueMode valueMode,
                       String valueJson, String secretRef, Long actorId) {
        assertRevision(expectedRevision);
        applyContent(valueMode, valueJson, secretRef);
        touch(actorId);
    }

    public void changeStatus(long expectedRevision, boolean enabled, Long actorId) {
        assertRevision(expectedRevision);
        if (active == enabled) throw new IllegalArgumentException("参数当前值已经处于目标状态");
        active = enabled;
        touch(actorId);
    }

    public void restore(long expectedRevision, ConfigurationValueMode valueMode,
                        String valueJson, String secretRef, boolean active, Long actorId) {
        assertRevision(expectedRevision);
        applyContent(valueMode, valueJson, secretRef);
        this.active = active;
        touch(actorId);
    }

    public void assertRevision(long expectedRevision) {
        if (revision == null || revision != expectedRevision) throw new StaleConfigurationRevisionException(revision);
    }

    private void applyContent(ConfigurationValueMode valueMode, String valueJson, String secretRef) {
        this.valueMode = require(valueMode, "参数值模式");
        String normalizedValue = optionalText(valueJson, 20000);
        String normalizedSecret = optionalText(secretRef, 500);
        if (valueMode == ConfigurationValueMode.OVERRIDE) {
            if ((normalizedValue == null) == (normalizedSecret == null)) {
                throw new IllegalArgumentException("覆盖模式必须且只能提供参数值或密钥引用之一");
            }
        } else if (normalizedValue != null || normalizedSecret != null) {
            throw new IllegalArgumentException("非覆盖模式不能携带参数值或密钥引用");
        }
        this.valueJson = normalizedValue;
        this.secretRef = normalizedSecret;
    }

    private void touch(Long actorId) {
        updatedAt = Instant.now();
        updatedBy = requireId(actorId, "操作用户");
    }

    private static <T> T require(T value, String label) {
        if (value == null) throw new IllegalArgumentException(label + "不能为空");
        return value;
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

    private static String optionalText(String value, int max) {
        if (value == null || value.isBlank()) return null;
        String result = value.trim();
        if (result.length() > max) throw new IllegalArgumentException("文本长度不能超过" + max);
        return result;
    }

    public Long id() { return id; }
    public Long definitionId() { return definitionId; }
    public Long tenantId() { return tenantId; }
    public ConfigurationScope scopeType() { return scopeType; }
    public Long scopeId() { return scopeId; }
    public String scopeReference() { return scopeReference; }
    public String scopeCode() { return scopeCode; }
    public ConfigurationValueMode valueMode() { return valueMode; }
    public String valueJson() { return valueJson; }
    public String secretRef() { return secretRef; }
    public boolean active() { return active; }
    public Long revision() { return revision; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public Long updatedBy() { return updatedBy; }
}
