package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrimaryKeyJoinColumn;
import jakarta.persistence.SecondaryTable;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.SQLRestriction;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "RHN_BD_CATALOG_ITEM")
@SecondaryTable(name = "RHN_BD_SUPPLY_ITEM", pkJoinColumns = @PrimaryKeyJoinColumn(name = "ID_CATALOG_ITEM"))
@SQLRestriction("SD_ITEM_TYPE = 'SUPPLY'")
public class SupplyItem {
    @Id @Column(name = "ID_CATALOG_ITEM") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ITEM_TYPE", nullable = false) private Long itemTypeId;
    @Column(name = "ID_ITEM_MASTER") private Long itemMasterId;
    @Column(name = "CD_CATALOG_ITEM", nullable = false) private String code;
    @Column(name = "NA_CATALOG_ITEM", nullable = false) private String name;
    @Column(name = "SD_ITEM_TYPE", nullable = false) private String itemType;
    @Column(name = "CD_UNIT") private String unitCode;
    @Column(name = "FG_ORDRBL", nullable = false) private boolean orderable;
    @Column(name = "FG_CHGBL", nullable = false) private boolean chargeable;
    @Column(name = "FG_STOCKED", nullable = false) private boolean stocked;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate validFrom;
    @Column(name = "DA_VALID_TO") private LocalDate validTo;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;

    @Column(name = "ID_TNT", table = "RHN_BD_SUPPLY_ITEM", nullable = false) private Long supplyTenantId;
    @Column(name = "CD_UDI_DI", table = "RHN_BD_SUPPLY_ITEM") private String udiDi;
    @Column(name = "CD_GENERIC", table = "RHN_BD_SUPPLY_ITEM") private String genericCode;
    @Column(name = "NA_GENERIC", table = "RHN_BD_SUPPLY_ITEM") private String genericName;
    @Column(name = "NA_MODEL", table = "RHN_BD_SUPPLY_ITEM") private String modelName;
    @Column(name = "DES_SPEC", table = "RHN_BD_SUPPLY_ITEM") private String specification;
    @Column(name = "SD_MATL_TYPE", table = "RHN_BD_SUPPLY_ITEM") private String materialType;
    @Column(name = "SD_DEVICE_CLASS", table = "RHN_BD_SUPPLY_ITEM") private String deviceClass;
    @Column(name = "FG_HIGH_VAL", table = "RHN_BD_SUPPLY_ITEM", nullable = false) private boolean highValue;
    @Column(name = "FG_IMPLANT", table = "RHN_BD_SUPPLY_ITEM", nullable = false) private boolean implant;
    @Column(name = "FG_INTRVN", table = "RHN_BD_SUPPLY_ITEM", nullable = false) private boolean intervention;
    @Column(name = "FG_STERILE", table = "RHN_BD_SUPPLY_ITEM", nullable = false) private boolean sterile;
    @Column(name = "FG_SINGLE_USE", table = "RHN_BD_SUPPLY_ITEM", nullable = false) private boolean singleUse;
    @Column(name = "CD_REG", table = "RHN_BD_SUPPLY_ITEM") private String registrationCode;
    @Column(name = "NA_REG", table = "RHN_BD_SUPPLY_ITEM") private String registrationName;
    @Column(name = "NA_REGSTR", table = "RHN_BD_SUPPLY_ITEM") private String registrantName;
    @Column(name = "DA_REG_FROM", table = "RHN_BD_SUPPLY_ITEM") private LocalDate registrationFrom;
    @Column(name = "DA_REG_TO", table = "RHN_BD_SUPPLY_ITEM") private LocalDate registrationTo;
    @Column(name = "ID_MFR", table = "RHN_BD_SUPPLY_ITEM") private Long manufacturerId;
    @Column(name = "DES_STRUCT_DESCR", table = "RHN_BD_SUPPLY_ITEM") private String structureDescription;
    @Column(name = "DES_SCOPE_DESCR", table = "RHN_BD_SUPPLY_ITEM") private String scopeDescription;
    @Column(name = "DES_INSTR", table = "RHN_BD_SUPPLY_ITEM") private String instruction;

    protected SupplyItem() {}

    public SupplyItem(Long tenantId, Long actorId, Long itemTypeId, String code, String name,
                      String unitCode, boolean orderable, boolean chargeable, boolean stocked,
                      String status, LocalDate validFrom, LocalDate validTo, String udiDi,
                      String genericCode, String genericName, String modelName, String specification,
                      String materialType, String deviceClass, boolean highValue, boolean implant,
                      boolean intervention, boolean sterile, boolean singleUse,
                      String registrationCode, String registrationName, String registrantName,
                      LocalDate registrationFrom, LocalDate registrationTo, Long manufacturerId,
                      String structureDescription, String scopeDescription, String instruction) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.supplyTenantId = tenantId;
        this.itemType = "SUPPLY";
        this.code = requireText(code, "耗材/器械编码");
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        updateValues(actorId, itemTypeId, name, unitCode, orderable, chargeable, stocked, status,
                validFrom, validTo, udiDi, genericCode, genericName, modelName, specification,
                materialType, deviceClass, highValue, implant, intervention, sterile, singleUse,
                registrationCode, registrationName, registrantName, registrationFrom, registrationTo,
                manufacturerId, structureDescription, scopeDescription, instruction);
    }

    public void update(long expectedRevision, Long actorId, Long itemTypeId, String name,
                       String unitCode, boolean orderable, boolean chargeable, boolean stocked,
                       String status, LocalDate validFrom, LocalDate validTo, String udiDi,
                       String genericCode, String genericName, String modelName, String specification,
                       String materialType, String deviceClass, boolean highValue, boolean implant,
                       boolean intervention, boolean sterile, boolean singleUse,
                       String registrationCode, String registrationName, String registrantName,
                       LocalDate registrationFrom, LocalDate registrationTo, Long manufacturerId,
                       String structureDescription, String scopeDescription, String instruction) {
        requireRevision(expectedRevision);
        updateValues(actorId, itemTypeId, name, unitCode, orderable, chargeable, stocked, status,
                validFrom, validTo, udiDi, genericCode, genericName, modelName, specification,
                materialType, deviceClass, highValue, implant, intervention, sterile, singleUse,
                registrationCode, registrationName, registrantName, registrationFrom, registrationTo,
                manufacturerId, structureDescription, scopeDescription, instruction);
    }

    public void changeStatus(long expectedRevision, Long actorId, String status) {
        requireRevision(expectedRevision);
        this.status = status;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    private void updateValues(Long actorId, Long itemTypeId, String name, String unitCode,
                              boolean orderable, boolean chargeable, boolean stocked, String status,
                              LocalDate validFrom, LocalDate validTo, String udiDi, String genericCode,
                              String genericName, String modelName, String specification,
                              String materialType, String deviceClass, boolean highValue, boolean implant,
                              boolean intervention, boolean sterile, boolean singleUse,
                              String registrationCode, String registrationName, String registrantName,
                              LocalDate registrationFrom, LocalDate registrationTo, Long manufacturerId,
                              String structureDescription, String scopeDescription, String instruction) {
        ServiceCatalogItem.requirePeriod(validFrom, validTo);
        if (registrationFrom != null) ServiceCatalogItem.requirePeriod(registrationFrom, registrationTo);
        if (registrationTo != null && registrationFrom == null) {
            throw new IllegalArgumentException("填写注册有效期止时必须填写有效期起");
        }
        if (deviceClass != null && !deviceClass.isBlank()
                && !java.util.Set.of("I", "II", "III").contains(deviceClass)) {
            throw new IllegalArgumentException("医疗器械分类必须为 I、II 或 III 类");
        }
        if (implant && !highValue) throw new IllegalArgumentException("植入类器械必须标记为高值耗材");
        this.itemTypeId = itemTypeId;
        this.name = requireText(name, "耗材/器械名称");
        this.unitCode = requireText(unitCode, "基础单位");
        this.orderable = orderable;
        this.chargeable = chargeable;
        this.stocked = stocked;
        this.status = status;
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.udiDi = trim(udiDi);
        this.genericCode = trim(genericCode);
        this.genericName = trim(genericName);
        this.modelName = trim(modelName);
        this.specification = trim(specification);
        this.materialType = trim(materialType);
        this.deviceClass = trim(deviceClass);
        this.highValue = highValue;
        this.implant = implant;
        this.intervention = intervention;
        this.sterile = sterile;
        this.singleUse = singleUse;
        this.registrationCode = trim(registrationCode);
        this.registrationName = trim(registrationName);
        this.registrantName = trim(registrantName);
        this.registrationFrom = registrationFrom;
        this.registrationTo = registrationTo;
        this.manufacturerId = manufacturerId;
        this.structureDescription = trim(structureDescription);
        this.scopeDescription = trim(scopeDescription);
        this.instruction = trim(instruction);
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    private static String requireText(String value, String label) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + "不能为空");
        return value.trim();
    }
    private static String trim(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private void requireRevision(long expected) {
        if (revision != expected) throw new IllegalStateException("耗材/器械资料已被其他用户修改，请刷新后重试");
    }

    public Long id() { return id; } public long revision() { return revision; } public Long tenantId() { return tenantId; }
    public Long itemTypeId() { return itemTypeId; } public String code() { return code; } public String name() { return name; }
    public String unitCode() { return unitCode; } public boolean orderable() { return orderable; }
    public boolean chargeable() { return chargeable; } public boolean stocked() { return stocked; }
    public String status() { return status; } public LocalDate validFrom() { return validFrom; } public LocalDate validTo() { return validTo; }
    public String udiDi() { return udiDi; } public String genericCode() { return genericCode; }
    public String genericName() { return genericName; } public String modelName() { return modelName; }
    public String specification() { return specification; } public String materialType() { return materialType; }
    public String deviceClass() { return deviceClass; } public boolean highValue() { return highValue; }
    public boolean implant() { return implant; } public boolean intervention() { return intervention; }
    public boolean sterile() { return sterile; } public boolean singleUse() { return singleUse; }
    public String registrationCode() { return registrationCode; } public String registrationName() { return registrationName; }
    public String registrantName() { return registrantName; } public LocalDate registrationFrom() { return registrationFrom; }
    public LocalDate registrationTo() { return registrationTo; } public Long manufacturerId() { return manufacturerId; }
    public String structureDescription() { return structureDescription; } public String scopeDescription() { return scopeDescription; }
    public String instruction() { return instruction; }
}
