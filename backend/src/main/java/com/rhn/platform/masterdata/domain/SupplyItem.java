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
@Table(name = "catalog_items")
@SecondaryTable(name = "supply_items", pkJoinColumns = @PrimaryKeyJoinColumn(name = "catalog_item_id"))
@SQLRestriction("item_type = 'SUPPLY'")
public class SupplyItem {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "item_type_id", nullable = false) private Long itemTypeId;
    @Column(name = "item_master_id") private Long itemMasterId;
    @Column(nullable = false) private String code;
    @Column(nullable = false) private String name;
    @Column(name = "item_type", nullable = false) private String itemType;
    @Column(name = "unit_code") private String unitCode;
    @Column(nullable = false) private boolean orderable;
    @Column(nullable = false) private boolean chargeable;
    @Column(nullable = false) private boolean stocked;
    @Column(nullable = false) private String status;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by") private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by") private Long updatedBy;

    @Column(table = "supply_items", name = "tenant_id", nullable = false) private Long supplyTenantId;
    @Column(table = "supply_items", name = "udi_di") private String udiDi;
    @Column(table = "supply_items", name = "generic_code") private String genericCode;
    @Column(table = "supply_items", name = "generic_name") private String genericName;
    @Column(table = "supply_items", name = "model_name") private String modelName;
    @Column(table = "supply_items") private String specification;
    @Column(table = "supply_items", name = "material_type") private String materialType;
    @Column(table = "supply_items", name = "device_class") private String deviceClass;
    @Column(table = "supply_items", name = "high_value", nullable = false) private boolean highValue;
    @Column(table = "supply_items", nullable = false) private boolean implant;
    @Column(table = "supply_items", nullable = false) private boolean intervention;
    @Column(table = "supply_items", nullable = false) private boolean sterile;
    @Column(table = "supply_items", name = "single_use", nullable = false) private boolean singleUse;
    @Column(table = "supply_items", name = "registration_code") private String registrationCode;
    @Column(table = "supply_items", name = "registration_name") private String registrationName;
    @Column(table = "supply_items", name = "registrant_name") private String registrantName;
    @Column(table = "supply_items", name = "registration_from") private LocalDate registrationFrom;
    @Column(table = "supply_items", name = "registration_to") private LocalDate registrationTo;
    @Column(table = "supply_items", name = "manufacturer_id") private Long manufacturerId;
    @Column(table = "supply_items", name = "structure_description") private String structureDescription;
    @Column(table = "supply_items", name = "scope_description") private String scopeDescription;
    @Column(table = "supply_items") private String instruction;

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
