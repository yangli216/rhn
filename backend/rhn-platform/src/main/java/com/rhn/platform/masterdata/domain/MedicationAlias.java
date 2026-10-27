package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 药品别名：一个别名一行；检索码由检索表按别名名称生成，这里只可选保存人工助记码。 */
@Entity
@Table(name = "RHN_BD_MED_ALIAS")
public class MedicationAlias {
    @Id @Column(name = "ID_MED_ALIAS") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_MED", nullable = false) private Long medicationId;
    @Column(name = "SD_ALIAS_TYPE", nullable = false) private String aliasType;
    @Column(name = "NA_ALIAS", nullable = false) private String aliasName;
    @Column(name = "CD_MNEM") private String mnemonicCode;
    @Column(name = "FG_PRIMARY_ALIAS", nullable = false) private boolean primaryAlias;
    @Column(name = "SD_STATUS", nullable = false) private String status;

    protected MedicationAlias() {}

    public MedicationAlias(Long tenantId, Long medicationId, String aliasType, String aliasName,
                           String mnemonicCode, boolean primaryAlias, String status) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.medicationId = medicationId;
        this.aliasType = required(aliasType, "药品别名类型");
        this.aliasName = required(aliasName, "药品别名");
        this.mnemonicCode = mnemonicCode == null || mnemonicCode.isBlank() ? null : mnemonicCode.trim();
        this.primaryAlias = primaryAlias;
        this.status = required(status, "药品别名状态");
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long medicationId() { return medicationId; }
    public String aliasType() { return aliasType; }
    public String aliasName() { return aliasName; }
    public String mnemonicCode() { return mnemonicCode; }
    public boolean primaryAlias() { return primaryAlias; }
    public String status() { return status; }

    private static String required(String value, String label) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + "不能为空");
        return value.trim();
    }
}
