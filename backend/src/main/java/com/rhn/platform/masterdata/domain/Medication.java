package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "medications")
public class Medication {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "item_type_id", nullable = false) private Long itemTypeId;
    @Column(name = "item_master_id") private Long itemMasterId;
    @Column(nullable = false) private String code;
    @Column(nullable = false) private String name;
    @Column(name = "alias_name") private String aliasName;
    @Column(name = "medication_type", nullable = false) private String medicationType;
    @Column(name = "dose_form") private String doseForm;
    @Column(name = "preparation_spec") private String preparationSpec;
    @Column(name = "preparation_unit") private String preparationUnit;
    @Column(name = "strength_value") private BigDecimal strengthValue;
    @Column(name = "strength_unit") private String strengthUnit;
    @Column(name = "storage_type") private String storageType;
    @Column(name = "prescription_drug", nullable = false) private boolean prescriptionDrug;
    @Column(name = "essential_drug", nullable = false) private boolean essentialDrug;
    @Column(nullable = false) private boolean antimicrobial;
    @Column(name = "antimicrobial_level") private String antimicrobialLevel;
    @Column(name = "skin_test_required", nullable = false) private boolean skinTestRequired;
    @Column(name = "default_dose") private BigDecimal defaultDose;
    @Column(name = "default_dose_unit") private String defaultDoseUnit;
    @Column(name = "default_route") private String defaultRoute;
    @Column(name = "default_frequency") private String defaultFrequency;
    @Column(name = "chronic_disease_drug", nullable = false) private boolean chronicDiseaseDrug;
    @Column(name = "single_order", nullable = false) private boolean singleOrder;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by") private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by") private Long updatedBy;

    protected Medication() {}

    public Medication(Long tenantId, Long actorId, Long itemTypeId, String code, String name, String aliasName,
                      String medicationType, String doseForm, String preparationSpec, String preparationUnit,
                      BigDecimal strengthValue, String strengthUnit, String storageType,
                      boolean prescriptionDrug, boolean essentialDrug, boolean antimicrobial,
                      String antimicrobialLevel, boolean skinTestRequired, BigDecimal defaultDose,
                      String defaultDoseUnit, String defaultRoute, String defaultFrequency,
                      boolean chronicDiseaseDrug, boolean singleOrder, String status) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.itemTypeId = itemTypeId; this.code = code;
        this.createdAt = Instant.now(); this.createdBy = actorId;
        updateValues(actorId, name, aliasName, medicationType, doseForm, preparationSpec, preparationUnit,
                strengthValue, strengthUnit, storageType, prescriptionDrug, essentialDrug, antimicrobial,
                antimicrobialLevel, skinTestRequired, defaultDose, defaultDoseUnit, defaultRoute, defaultFrequency,
                chronicDiseaseDrug, singleOrder, status);
    }

    public void update(long expectedRevision, Long actorId, Long itemTypeId, String name, String aliasName,
                       String medicationType, String doseForm, String preparationSpec, String preparationUnit,
                       BigDecimal strengthValue, String strengthUnit, String storageType,
                       boolean prescriptionDrug, boolean essentialDrug, boolean antimicrobial,
                       String antimicrobialLevel, boolean skinTestRequired, BigDecimal defaultDose,
                       String defaultDoseUnit, String defaultRoute, String defaultFrequency,
                       boolean chronicDiseaseDrug, boolean singleOrder, String status) {
        requireRevision(expectedRevision);
        this.itemTypeId = itemTypeId;
        updateValues(actorId, name, aliasName, medicationType, doseForm, preparationSpec, preparationUnit,
                strengthValue, strengthUnit, storageType, prescriptionDrug, essentialDrug, antimicrobial,
                antimicrobialLevel, skinTestRequired, defaultDose, defaultDoseUnit, defaultRoute, defaultFrequency,
                chronicDiseaseDrug, singleOrder, status);
    }

    public void changeStatus(long expectedRevision, Long actorId, String status) {
        requireRevision(expectedRevision); this.status = status; this.updatedAt = Instant.now(); this.updatedBy = actorId;
    }

    private void updateValues(Long actorId, String name, String aliasName, String medicationType, String doseForm,
                              String preparationSpec, String preparationUnit, BigDecimal strengthValue,
                              String strengthUnit, String storageType, boolean prescriptionDrug,
                              boolean essentialDrug, boolean antimicrobial, String antimicrobialLevel,
                              boolean skinTestRequired, BigDecimal defaultDose, String defaultDoseUnit,
                              String defaultRoute, String defaultFrequency, boolean chronicDiseaseDrug,
                              boolean singleOrder, String status) {
        if (strengthValue != null && strengthValue.signum() <= 0) throw new IllegalArgumentException("含量必须大于0");
        if (defaultDose != null && defaultDose.signum() <= 0) throw new IllegalArgumentException("默认剂量必须大于0");
        if (!antimicrobial && antimicrobialLevel != null) throw new IllegalArgumentException("非抗菌药物不能设置抗菌药等级");
        this.name = name; this.aliasName = aliasName; this.medicationType = medicationType; this.doseForm = doseForm;
        this.preparationSpec = preparationSpec; this.preparationUnit = preparationUnit;
        this.strengthValue = strengthValue; this.strengthUnit = strengthUnit; this.storageType = storageType;
        this.prescriptionDrug = prescriptionDrug; this.essentialDrug = essentialDrug;
        this.antimicrobial = antimicrobial; this.antimicrobialLevel = antimicrobialLevel;
        this.skinTestRequired = skinTestRequired; this.defaultDose = defaultDose;
        this.defaultDoseUnit = defaultDoseUnit; this.defaultRoute = defaultRoute;
        this.defaultFrequency = defaultFrequency; this.chronicDiseaseDrug = chronicDiseaseDrug;
        this.singleOrder = singleOrder; this.status = status;
        this.updatedAt = Instant.now(); this.updatedBy = actorId;
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw new IllegalStateException("药品知识已被其他用户修改，请刷新后重试");
    }

    public Long id() { return id; } public long revision() { return revision; } public Long tenantId() { return tenantId; }
    public Long itemTypeId() { return itemTypeId; } public Long itemMasterId() { return itemMasterId; }
    public String code() { return code; } public String name() { return name; } public String aliasName() { return aliasName; }
    public String medicationType() { return medicationType; } public String doseForm() { return doseForm; }
    public String preparationSpec() { return preparationSpec; } public String preparationUnit() { return preparationUnit; }
    public BigDecimal strengthValue() { return strengthValue; } public String strengthUnit() { return strengthUnit; }
    public String storageType() { return storageType; }
    public boolean prescriptionDrug() { return prescriptionDrug; } public boolean essentialDrug() { return essentialDrug; }
    public boolean antimicrobial() { return antimicrobial; } public String antimicrobialLevel() { return antimicrobialLevel; }
    public boolean skinTestRequired() { return skinTestRequired; } public BigDecimal defaultDose() { return defaultDose; }
    public String defaultDoseUnit() { return defaultDoseUnit; }
    public String defaultRoute() { return defaultRoute; } public String defaultFrequency() { return defaultFrequency; }
    public boolean chronicDiseaseDrug() { return chronicDiseaseDrug; } public boolean singleOrder() { return singleOrder; }
    public String status() { return status; }
}
