package com.rhn.platform.configuration.domain;

import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.text.Strings;
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
@Table(name = "RHN_SYS_PARAM_CHG")
public class ParameterChange {
    @Id @Column(name = "ID_PARAM_CHG") private Long id;
    @Column(name = "ID_TNT") private Long tenantId;
    @Column(name = "ID_PARAM_DEF", nullable = false) private Long definitionId;
    @Column(name = "ID_PARAM_VAL") private Long valueId;
    @Enumerated(EnumType.STRING) @Column(name = "SD_TARGET_TYPE", nullable = false, length = 24)
    private ConfigurationChangeTargetType targetType;
    @Enumerated(EnumType.STRING) @Column(name = "SD_CHG_TYPE", nullable = false, length = 24)
    private ConfigurationChangeType changeType;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR) @Column(name = "JSON_BEFORE") private String beforeJson;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR) @Column(name = "JSON_AFTER") private String afterJson;
    @Column(name = "DES_CHG_REASON", length = 1000) private String changeReason;
    @Column(name = "CD_REQ", nullable = false, length = 128) private String requestCode;
    @Column(name = "DT_CHANGED", nullable = false) private Instant changedAt;
    @Column(name = "ID_USER_CHANGED", nullable = false) private Long changedBy;

    protected ParameterChange() {
    }

    public ParameterChange(Long tenantId, Long definitionId, Long valueId,
                           ConfigurationChangeType changeType, String beforeJson, String afterJson,
                           String changeReason, String requestCode, Long actorId) {
        if (beforeJson == null && afterJson == null) throw new IllegalArgumentException("参数变更快照不能为空");
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.definitionId = Strings.requireId(definitionId, "参数定义");
        this.valueId = valueId;
        this.targetType = valueId == null
                ? ConfigurationChangeTargetType.DEFINITION : ConfigurationChangeTargetType.VALUE;
        this.changeType = Strings.require(changeType, "参数变更类型");
        this.beforeJson = beforeJson;
        this.afterJson = afterJson;
        this.changeReason = Strings.optionalText(changeReason, 1000);
        this.requestCode = Strings.requireText(requestCode, "请求编码", 128);
        this.changedAt = Instant.now();
        this.changedBy = Strings.requireId(actorId, "操作用户");
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long definitionId() { return definitionId; }
    public Long valueId() { return valueId; }
    public ConfigurationChangeTargetType targetType() { return targetType; }
    public ConfigurationChangeType changeType() { return changeType; }
    public String beforeJson() { return beforeJson; }
    public String afterJson() { return afterJson; }
    public String changeReason() { return changeReason; }
    public String requestCode() { return requestCode; }
    public Instant changedAt() { return changedAt; }
    public Long changedBy() { return changedBy; }
}
