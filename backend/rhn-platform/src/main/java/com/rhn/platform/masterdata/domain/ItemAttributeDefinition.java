package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_BD_ITEM_ATTR_DEF")
public class ItemAttributeDefinition {
    @Id @Column(name = "ID_ITEM_ATTR_DEF") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "SD_SCOPE_TYPE", nullable = false) private String scopeType;
    @Column(name = "CD_SCOPE", nullable = false) private String scopeCode;
    @Column(name = "ID_TNT") private Long tenantId;
    @Column(name = "CD_ITEM_ATTR_DEF", nullable = false) private String code;
    @Column(name = "NA_ITEM_ATTR_DEF", nullable = false) private String name;
    @Column(name = "DES_ITEM_ATTR_DEF", nullable = false) private String description;
    @Column(name = "SD_DATA_TYPE", nullable = false) private String dataType;
    @Column(name = "SD_CARDNL", nullable = false) private String cardinality;
    @Column(name = "ID_DICT_DEF_DICT") private Long dictionaryId;
    @Column(name = "CD_UNIT") private String unitCode;
    @Lob @Column(name = "JSON_SCHEMA", nullable = false) private String schemaJson;
    @Lob @Column(name = "JSON_DEFAULT") private String defaultJson;
    @Column(name = "SD_VARBLTY", nullable = false) private String variability;
    @Column(name = "SD_OVRD_POLICY", nullable = false) private String overridePolicy;
    @Lob @Column(name = "JSON_ALLOWED_SCOPE", nullable = false) private String allowedScopeJson;
    @Column(name = "SD_CONTEXT_BASIS", nullable = false) private String contextBasis;
    @Column(name = "SD_STORAGE_MODE", nullable = false) private String storageMode;
    @Column(name = "PROJ_FIELD") private String projectionField;
    @Column(name = "ID_VLDN_RULE") private Long validationRuleId;
    @Column(name = "SENS", nullable = false) private String sensitivity;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected ItemAttributeDefinition() {}

    public ItemAttributeDefinition(Long tenantId, String code, String name, String description,
                                   String dataType, String cardinality, Long dictionaryId, String unitCode,
                                   String schemaJson, String defaultJson, String variability,
                                   String overridePolicy, String allowedScopeJson, String contextBasis,
                                   String sensitivity, Long actorId) {
        this.id = GlobalIds.next();
        this.scopeType = "TENANT";
        this.scopeCode = "TENANT:" + requireId(tenantId, "租户");
        this.tenantId = tenantId;
        this.code = requireText(code, "属性编码", 128);
        apply(name, description, dataType, cardinality, dictionaryId, unitCode, schemaJson, defaultJson,
                variability, overridePolicy, allowedScopeJson, contextBasis, sensitivity);
        this.storageMode = "EXTENSION";
        this.projectionField = null;
        this.validationRuleId = null;
        this.status = "ACTIVE";
        this.createdAt = Instant.now();
        this.createdBy = requireId(actorId, "操作用户");
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    public void update(long expectedRevision, String name, String description, String dataType,
                       String cardinality, Long dictionaryId, String unitCode, String schemaJson,
                       String defaultJson, String variability, String overridePolicy,
                       String allowedScopeJson, String contextBasis, String sensitivity, Long actorId) {
        requireRevision(expectedRevision);
        apply(name, description, dataType, cardinality, dictionaryId, unitCode, schemaJson, defaultJson,
                variability, overridePolicy, allowedScopeJson, contextBasis, sensitivity);
        touch(actorId);
    }

    public void changeStatus(long expectedRevision, String status, Long actorId) {
        requireRevision(expectedRevision);
        if (!"ACTIVE".equals(status) && !"INACTIVE".equals(status)) {
            throw new IllegalArgumentException("属性定义状态仅支持 ACTIVE 或 INACTIVE");
        }
        this.status = status;
        touch(actorId);
    }

    private void apply(String name, String description, String dataType, String cardinality,
                       Long dictionaryId, String unitCode, String schemaJson, String defaultJson,
                       String variability, String overridePolicy, String allowedScopeJson,
                       String contextBasis, String sensitivity) {
        this.name = requireText(name, "属性名称", 200);
        this.description = requireText(description, "属性说明", 1000);
        this.dataType = requireText(dataType, "数据类型", 32);
        this.cardinality = requireText(cardinality, "基数", 16);
        this.dictionaryId = dictionaryId;
        this.unitCode = optionalText(unitCode, 64);
        this.schemaJson = requireText(schemaJson, "JSON Schema", 20000);
        this.defaultJson = optionalText(defaultJson, 20000);
        this.variability = requireText(variability, "可变性", 32);
        this.overridePolicy = requireText(overridePolicy, "覆盖策略", 32);
        this.allowedScopeJson = requireText(allowedScopeJson, "允许作用域", 20000);
        this.contextBasis = requireText(contextBasis, "上下文依据", 32);
        this.sensitivity = requireText(sensitivity, "敏感级别", 32);
    }

    private void touch(Long actorId) {
        this.updatedAt = Instant.now();
        this.updatedBy = requireId(actorId, "操作用户");
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw new IllegalArgumentException("属性定义修订号已变化");
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public String scopeType() { return scopeType; }
    public String scopeCode() { return scopeCode; }
    public Long tenantId() { return tenantId; }
    public String code() { return code; }
    public String name() { return name; }
    public String description() { return description; }
    public String dataType() { return dataType; }
    public String cardinality() { return cardinality; }
    public Long dictionaryId() { return dictionaryId; }
    public String unitCode() { return unitCode; }
    public String schemaJson() { return schemaJson; }
    public String defaultJson() { return defaultJson; }
    public String variability() { return variability; }
    public String overridePolicy() { return overridePolicy; }
    public String allowedScopeJson() { return allowedScopeJson; }
    public String contextBasis() { return contextBasis; }
    public String storageMode() { return storageMode; }
    public String projectionField() { return projectionField; }
    public String sensitivity() { return sensitivity; }
    public String status() { return status; }

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
