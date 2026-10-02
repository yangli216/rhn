package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "RHN_BD_ITEM_ALIAS")
public class ItemAlias {
    @Id @Column(name = "ID_ITEM_ALIAS") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "SD_ALIAS_TYPE", nullable = false) private String aliasType;
    @Column(name = "NA_ALIAS", nullable = false) private String aliasName;
    @Column(name = "CD_PINYIN") private String pinyinCode;
    @Column(name = "CD_WUBI") private String wubiCode;
    @Column(name = "CD_MNEM") private String mnemonicCode;
    @Column(name = "FG_PRIMARY_ALIAS", nullable = false) private boolean primaryAlias;
    @Column(name = "SD_STATUS", nullable = false) private String status;

    protected ItemAlias() {}

    public ItemAlias(Long tenantId, Long catalogItemId, String aliasType, String aliasName,
                     String pinyinCode, String wubiCode, String mnemonicCode,
                     boolean primaryAlias, String status) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.catalogItemId = catalogItemId;
        this.aliasType = required(aliasType, "项目别名类型");
        this.aliasName = required(aliasName, "项目别名");
        this.pinyinCode = trim(pinyinCode);
        this.wubiCode = trim(wubiCode);
        this.mnemonicCode = trim(mnemonicCode);
        this.primaryAlias = primaryAlias;
        this.status = required(status, "项目别名状态");
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long catalogItemId() { return catalogItemId; }
    public String aliasType() { return aliasType; }
    public String aliasName() { return aliasName; }
    public String pinyinCode() { return pinyinCode; }
    public String wubiCode() { return wubiCode; }
    public String mnemonicCode() { return mnemonicCode; }
    public boolean primaryAlias() { return primaryAlias; }
    public String status() { return status; }

    private static String required(String value, String label) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + "不能为空");
        return value.trim();
    }

    private static String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
