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

@Entity
@Table(name = "RHN_SYS_PARAM_VAL")
public class ParameterValue {
    @Id @Column(name = "ID_PARAM_VAL") private Long id;
    @Column(name = "ID_PARAM_DEF", nullable = false) private Long definitionId;
    @Column(name = "ID_TNT") private Long tenantId;
    @Enumerated(EnumType.STRING) @Column(name = "SD_SCOPE_TYPE", nullable = false, length = 24)
    private ConfigurationScope scopeType;
    @Column(name = "ID_SCOPE") private Long scopeId;
    @Column(name = "SCOPE_REFERENCE", length = 128) private String scopeReference;
    @Column(name = "CD_SCOPE", nullable = false, length = 200) private String scopeCode;
    @Enumerated(EnumType.STRING) @Column(name = "SD_VAL_MODE", nullable = false, length = 24)
    private ConfigurationValueMode valueMode;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR) @Column(name = "JSON_VAL") private String valueJson;
    @Column(name = "SECRET_REF", length = 500) private String secretRef;
    @Column(name = "FG_ACTIVE", nullable = false) private boolean active;
    @Version @Column(name = "REVISION", nullable = false) private Long revision;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected ParameterValue() {
    }

    public ParameterValue(Long definitionId, Long tenantId, ConfigurationScope scopeType,
                          Long scopeId, String scopeReference, String scopeCode,
                          ConfigurationValueMode valueMode, String valueJson, String secretRef,
                          Long actorId) {
        this.id = GlobalIds.next();
        this.revision = null;
        this.definitionId = Strings.requireId(definitionId, "参数定义");
        this.tenantId = tenantId;
        this.scopeType = Strings.require(scopeType, "参数作用域");
        this.scopeId = scopeId;
        this.scopeReference = Strings.optionalText(scopeReference, 128);
        this.scopeCode = Strings.requireText(scopeCode, "作用域编码", 200);
        applyContent(valueMode, valueJson, secretRef);
        this.active = true;
        this.createdAt = Instant.now();
        this.createdBy = Strings.requireId(actorId, "操作用户");
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
        if (revision == null || revision != expectedRevision) {
            throw new StaleRevisionException(revision, "参数已被其他操作更新，请刷新后重试");
        }
    }

    private void applyContent(ConfigurationValueMode valueMode, String valueJson, String secretRef) {
        this.valueMode = Strings.require(valueMode, "参数值模式");
        String normalizedValue = Strings.optionalText(valueJson, 20000);
        String normalizedSecret = Strings.optionalText(secretRef, 500);
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
        updatedBy = Strings.requireId(actorId, "操作用户");
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
