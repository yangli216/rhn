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
@Table(name = "RHN_BD_MED")
public class Medication {
    @Id @Column(name = "ID_MED") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ITEM_TYPE", nullable = false) private Long itemTypeId;
    @Column(name = "ID_ITEM_MASTER") private Long itemMasterId;
    @Column(name = "CD_MED", nullable = false) private String code;
    @Column(name = "NA_MED", nullable = false) private String name;
    @Column(name = "NA_ALIAS") private String aliasName;
    @Column(name = "SD_MED_TYPE", nullable = false) private String medicationType;
    @Column(name = "DOSE_FORM") private String doseForm;
    @Column(name = "PREP_SPEC") private String preparationSpec;
    @Column(name = "PREP_UNIT") private String preparationUnit;
    @Column(name = "QTY_STRNTH_VAL") private BigDecimal strengthValue;
    @Column(name = "STRNTH_UNIT") private String strengthUnit;
    @Column(name = "SD_STORAGE_TYPE") private String storageType;
    @Column(name = "FG_RX_DRUG", nullable = false) private boolean prescriptionDrug;
    @Column(name = "FG_ESSNTL_DRUG", nullable = false) private boolean essentialDrug;
    @Column(name = "FG_ANTIMIC", nullable = false) private boolean antimicrobial;
    @Column(name = "SD_ANTIMIC_LEVEL") private String antimicrobialLevel;
    @Column(name = "FG_ANTIMIC_OP", nullable = false) private boolean antimicrobialOutpatientAllowed;
    @Column(name = "FG_ANTIMIC_CONSULT", nullable = false) private boolean antimicrobialConsultationRequired;
    @Column(name = "FG_ANTIMIC_EMERG", nullable = false) private boolean antimicrobialEmergencyAllowed;
    @Column(name = "QTY_ANTIMIC_MAX_DAYS") private Integer antimicrobialMaxDays;
    @Column(name = "FG_SKIN_TEST_RQD", nullable = false) private boolean skinTestRequired;
    @Column(name = "SD_SKIN_TEST_METHOD") private String skinTestMethod;
    @Column(name = "SD_SKIN_TEST_SOLN_MODE") private String skinTestSolutionMode;
    @Column(name = "QTY_SKIN_TEST_OBS_MINUTES") private Integer skinTestObservationMinutes;
    @Column(name = "QTY_SKIN_TEST_VALID_HOURS") private Integer skinTestResultValidityHours;
    @Column(name = "DES_SKIN_TEST_INSTR", length = 1000) private String skinTestInstructions;
    @Column(name = "QTY_DEFAULT_DOSE") private BigDecimal defaultDose;
    @Column(name = "DEFAULT_DOSE_UNIT") private String defaultDoseUnit;
    @Column(name = "ID_CONCEPT_DEFAULT_ROUTE") private Long defaultRouteId;
    @Column(name = "DEFAULT_ROUTE") private String defaultRoute;
    @Column(name = "ID_ORDER_FREQ_DEFAULT") private Long defaultFrequencyId;
    @Column(name = "DEFAULT_FREQ") private String defaultFrequency;
    @Column(name = "FG_CHRONIC_DISEASE_DRUG", nullable = false) private boolean chronicDiseaseDrug;
    @Column(name = "FG_SINGLE_ORDER", nullable = false) private boolean singleOrder;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;

    protected Medication() {}

    public Medication(Long tenantId, Long actorId, Long itemTypeId, String code, String name, String aliasName,
                      String medicationType, String doseForm, String preparationSpec, String preparationUnit,
                      BigDecimal strengthValue, String strengthUnit, String storageType,
                      boolean prescriptionDrug, boolean essentialDrug, boolean antimicrobial,
                      String antimicrobialLevel, boolean antimicrobialOutpatientAllowed,
                      boolean antimicrobialConsultationRequired, boolean antimicrobialEmergencyAllowed,
                      Integer antimicrobialMaxDays, boolean skinTestRequired, String skinTestMethod,
                      String skinTestSolutionMode, Integer skinTestObservationMinutes,
                      Integer skinTestResultValidityHours, String skinTestInstructions, BigDecimal defaultDose,
                      String defaultDoseUnit, String defaultRoute, Long defaultFrequencyId, String defaultFrequency,
                      boolean chronicDiseaseDrug, boolean singleOrder, String status) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.itemTypeId = itemTypeId; this.code = code;
        this.createdAt = Instant.now(); this.createdBy = actorId;
        updateValues(actorId, name, aliasName, medicationType, doseForm, preparationSpec, preparationUnit,
                strengthValue, strengthUnit, storageType, prescriptionDrug, essentialDrug, antimicrobial,
                antimicrobialLevel, antimicrobialOutpatientAllowed, antimicrobialConsultationRequired,
                antimicrobialEmergencyAllowed, antimicrobialMaxDays, skinTestRequired, skinTestMethod,
                skinTestSolutionMode, skinTestObservationMinutes, skinTestResultValidityHours,
                skinTestInstructions, defaultDose, defaultDoseUnit, defaultRoute, defaultFrequencyId, defaultFrequency,
                chronicDiseaseDrug, singleOrder, status);
    }

    public void update(long expectedRevision, Long actorId, Long itemTypeId, String name, String aliasName,
                       String medicationType, String doseForm, String preparationSpec, String preparationUnit,
                       BigDecimal strengthValue, String strengthUnit, String storageType,
                       boolean prescriptionDrug, boolean essentialDrug, boolean antimicrobial,
                       String antimicrobialLevel, boolean antimicrobialOutpatientAllowed,
                       boolean antimicrobialConsultationRequired, boolean antimicrobialEmergencyAllowed,
                       Integer antimicrobialMaxDays, boolean skinTestRequired, String skinTestMethod,
                       String skinTestSolutionMode, Integer skinTestObservationMinutes,
                       Integer skinTestResultValidityHours, String skinTestInstructions, BigDecimal defaultDose,
                       String defaultDoseUnit, String defaultRoute, Long defaultFrequencyId, String defaultFrequency,
                       boolean chronicDiseaseDrug, boolean singleOrder, String status) {
        requireRevision(expectedRevision);
        this.itemTypeId = itemTypeId;
        updateValues(actorId, name, aliasName, medicationType, doseForm, preparationSpec, preparationUnit,
                strengthValue, strengthUnit, storageType, prescriptionDrug, essentialDrug, antimicrobial,
                antimicrobialLevel, antimicrobialOutpatientAllowed, antimicrobialConsultationRequired,
                antimicrobialEmergencyAllowed, antimicrobialMaxDays, skinTestRequired, skinTestMethod,
                skinTestSolutionMode, skinTestObservationMinutes, skinTestResultValidityHours,
                skinTestInstructions, defaultDose, defaultDoseUnit, defaultRoute, defaultFrequencyId, defaultFrequency,
                chronicDiseaseDrug, singleOrder, status);
    }

    public void changeStatus(long expectedRevision, Long actorId, String status) {
        requireRevision(expectedRevision); this.status = status; this.updatedAt = Instant.now(); this.updatedBy = actorId;
    }

    public void assignDefaultRoute(Long routeId, String routeCode) {
        this.defaultRouteId = routeId;
        this.defaultRoute = routeCode;
    }

    private void updateValues(Long actorId, String name, String aliasName, String medicationType, String doseForm,
                              String preparationSpec, String preparationUnit, BigDecimal strengthValue,
                              String strengthUnit, String storageType, boolean prescriptionDrug,
                              boolean essentialDrug, boolean antimicrobial, String antimicrobialLevel,
                              boolean antimicrobialOutpatientAllowed, boolean antimicrobialConsultationRequired,
                              boolean antimicrobialEmergencyAllowed, Integer antimicrobialMaxDays,
                              boolean skinTestRequired, String skinTestMethod, String skinTestSolutionMode,
                              Integer skinTestObservationMinutes, Integer skinTestResultValidityHours,
                              String skinTestInstructions, BigDecimal defaultDose, String defaultDoseUnit,
                              String defaultRoute, Long defaultFrequencyId, String defaultFrequency, boolean chronicDiseaseDrug,
                              boolean singleOrder, String status) {
        if (strengthValue != null && strengthValue.signum() <= 0) throw new IllegalArgumentException("含量必须大于0");
        if (defaultDose != null && defaultDose.signum() <= 0) throw new IllegalArgumentException("默认剂量必须大于0");
        if (!antimicrobial && antimicrobialLevel != null) throw new IllegalArgumentException("非抗菌药物不能设置抗菌药等级");
        this.name = name; this.aliasName = aliasName; this.medicationType = medicationType; this.doseForm = doseForm;
        this.preparationSpec = preparationSpec; this.preparationUnit = preparationUnit;
        this.strengthValue = strengthValue; this.strengthUnit = strengthUnit; this.storageType = storageType;
        this.prescriptionDrug = prescriptionDrug; this.essentialDrug = essentialDrug;
        this.antimicrobial = antimicrobial; this.antimicrobialLevel = antimicrobialLevel;
        this.antimicrobialOutpatientAllowed = antimicrobialOutpatientAllowed;
        this.antimicrobialConsultationRequired = antimicrobialConsultationRequired;
        this.antimicrobialEmergencyAllowed = antimicrobialEmergencyAllowed;
        this.antimicrobialMaxDays = antimicrobialMaxDays;
        this.skinTestRequired = skinTestRequired; this.skinTestMethod = skinTestMethod;
        this.skinTestSolutionMode = skinTestSolutionMode;
        this.skinTestObservationMinutes = skinTestObservationMinutes;
        this.skinTestResultValidityHours = skinTestResultValidityHours;
        this.skinTestInstructions = skinTestInstructions; this.defaultDose = defaultDose;
        this.defaultDoseUnit = defaultDoseUnit; this.defaultRoute = defaultRoute;
        this.defaultFrequencyId = defaultFrequencyId; this.defaultFrequency = defaultFrequency; this.chronicDiseaseDrug = chronicDiseaseDrug;
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
    public boolean antimicrobialOutpatientAllowed() { return antimicrobialOutpatientAllowed; }
    public boolean antimicrobialConsultationRequired() { return antimicrobialConsultationRequired; }
    public boolean antimicrobialEmergencyAllowed() { return antimicrobialEmergencyAllowed; }
    public Integer antimicrobialMaxDays() { return antimicrobialMaxDays; }
    public boolean skinTestRequired() { return skinTestRequired; } public String skinTestMethod() { return skinTestMethod; }
    public String skinTestSolutionMode() { return skinTestSolutionMode; }
    public Integer skinTestObservationMinutes() { return skinTestObservationMinutes; }
    public Integer skinTestResultValidityHours() { return skinTestResultValidityHours; }
    public String skinTestInstructions() { return skinTestInstructions; }
    public BigDecimal defaultDose() { return defaultDose; }
    public String defaultDoseUnit() { return defaultDoseUnit; }
    public Long defaultRouteId() { return defaultRouteId; } public String defaultRoute() { return defaultRoute; }
    public Long defaultFrequencyId() { return defaultFrequencyId; }
    public String defaultFrequency() { return defaultFrequency; }
    public boolean chronicDiseaseDrug() { return chronicDiseaseDrug; } public boolean singleOrder() { return singleOrder; }
    public String status() { return status; }
}
