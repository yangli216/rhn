package com.rhn.platform.search.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.Objects;

@Entity
@Table(name = "RHN_BD_SEARCH_ENTRY")
public class SearchEntry {
    @Id @Column(name = "ID_SEARCH_ENTRY") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "SD_SCOPE_TYPE", nullable = false) private String scopeType;
    @Column(name = "ID_SCOPE", nullable = false) private Long scopeId;
    @Column(name = "ID_TNT") private Long tenantId;
    @Column(name = "SD_TARGET_TYPE", nullable = false) private String targetType;
    @Column(name = "ID_TARGET", nullable = false) private Long targetId;
    @Column(name = "SD_NAME_TYPE", nullable = false) private String nameType;
    @Column(name = "CD_SOURCE_KEY", nullable = false) private String sourceKey;
    @Column(name = "NA_SEARCH", nullable = false) private String searchName;
    @Column(name = "CD_PINYIN") private String pinyinCode;
    @Column(name = "CD_WUBI") private String wubiCode;
    @Column(name = "CD_MNEMONIC") private String mnemonicCode;
    @Column(name = "FG_PRIMARY", nullable = false) private boolean primary;
    @Column(name = "CD_GEN_VER") private String generatorVersion;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;

    protected SearchEntry() {}

    public SearchEntry(String scopeType, Long scopeId, Long tenantId, String targetType, Long targetId,
                       String nameType, String sourceKey, String searchName, String pinyinCode, String wubiCode,
                       String mnemonicCode, boolean primary, String generatorVersion, String status, Long actorId) {
        this.id = GlobalIds.next();
        this.scopeType = required(scopeType, "检索作用域类型");
        this.scopeId = Objects.requireNonNull(scopeId, "检索作用域标识不能为空");
        this.tenantId = tenantId;
        this.targetType = required(targetType, "检索目标类型");
        this.targetId = Objects.requireNonNull(targetId, "检索目标标识不能为空");
        this.nameType = required(nameType, "检索名称类型");
        this.sourceKey = required(sourceKey, "检索来源键");
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        update(searchName, pinyinCode, wubiCode, mnemonicCode, primary, generatorVersion, status, actorId);
    }

    public void update(String searchName, String pinyinCode, String wubiCode, String mnemonicCode,
                       boolean primary, String generatorVersion, String status, Long actorId) {
        this.searchName = required(searchName, "检索名称");
        this.pinyinCode = optional(pinyinCode);
        this.wubiCode = optional(wubiCode);
        this.mnemonicCode = optional(mnemonicCode);
        this.primary = primary;
        this.generatorVersion = optional(generatorVersion);
        this.status = required(status, "检索条目状态");
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public void synchronize(String searchName, String pinyinCode, String wubiCode, String sourceMnemonicCode,
                            boolean primary, String generatorVersion, String status, Long actorId) {
        update(searchName, pinyinCode, wubiCode,
                sourceMnemonicCode == null ? this.mnemonicCode : sourceMnemonicCode,
                primary, generatorVersion, status, actorId);
    }

    private static String required(String value, String label) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + "不能为空");
        return value.trim();
    }

    private static String optional(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public String scopeType() { return scopeType; }
    public Long scopeId() { return scopeId; }
    public Long tenantId() { return tenantId; }
    public String targetType() { return targetType; }
    public Long targetId() { return targetId; }
    public String nameType() { return nameType; }
    public String sourceKey() { return sourceKey; }
    public String searchName() { return searchName; }
    public String pinyinCode() { return pinyinCode; }
    public String wubiCode() { return wubiCode; }
    public String mnemonicCode() { return mnemonicCode; }
    public boolean primary() { return primary; }
    public String generatorVersion() { return generatorVersion; }
    public String status() { return status; }
}
