package com.rhn.outpatient.ordering;

import com.rhn.shared.api.BusinessException;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.PrimaryKeyJoinColumn;
import jakarta.persistence.SecondaryTable;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "RHN_EX_CARE_REQ")
@SecondaryTable(name = "RHN_EX_MED_REQ", pkJoinColumns = @PrimaryKeyJoinColumn(name = "ID_CARE_REQ"))
class MedicationRequest {
    @Id @Column(name = "ID_CARE_REQ") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "CD_REQ_NO", nullable = false) private String requestNo;
    @Column(name = "ID_REQ_GRP") private Long requestGroupId;
    @Column(name = "ID_CARE_REQ_PARENT") private Long parentRequestId;
    @Column(name = "SD_REQ_KIND", nullable = false) private String requestKind;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "CD_INTENT", nullable = false) private String intentCode;
    @Column(name = "CD_PRIORITY", nullable = false) private String priorityCode;
    @Column(name = "ID_CATALOG_ITEM") private Long catalogItemId;
    @Column(name = "ID_ITEM_PKG") private Long packageId;
    @Column(name = "ID_ORG_PERFORMER", nullable = false) private Long performerOrganizationId;
    @Column(name = "ID_DEPT_PERFORMER", nullable = false) private Long performerDepartmentId;
    @Column(name = "DA_BUSINESS", nullable = false) private LocalDate businessDate;
    @Column(name = "DT_AUTHORED", nullable = false) private Instant authoredAt;
    @Column(name = "ID_USER_AUTHORED", nullable = false) private Long authoredBy;
    @Column(name = "DES_REASON") private String reasonText;
    @Column(name = "DT_CANCELLED") private Instant cancelledAt;
    @Column(name = "ID_USER_CANCELLED") private Long cancelledBy;
    @Column(name = "DES_CANCEL_REASON") private String cancelReason;
    @Column(name = "CD_ITEM_SNAP", nullable = false) private String itemCodeSnapshot;
    @Column(name = "NA_ITEM_SNAP", nullable = false) private String itemNameSnapshot;
    @Column(name = "CD_UNIT_SNAP", nullable = false) private String unitCodeSnapshot;
    @Column(name = "CD_LOCAL_SNAP") private String localCodeSnapshot;
    @Column(name = "NA_LOCAL_SNAP") private String localNameSnapshot;
    @Column(name = "ID_ORG_CATALOG_ITEM_ADOPTION") private Long adoptionId;
    @Column(name = "SN_ADOPTION_VER") private Long adoptionRevision;
    @Column(name = "ID_CATALOG_PRICE") private Long priceId;
    @Column(name = "SN_PRICE_VER") private Long priceRevision;
    @Column(name = "SD_PRICE_TYPE") private String priceType;
    @Column(name = "PRICE_UNIT", precision = 24, scale = 6) private BigDecimal unitPrice;
    @Column(name = "AMT_TOTAL", precision = 24, scale = 6) private BigDecimal totalAmount;
    @Column(name = "CD_CURRENCY") private String currencyCode;
    @Lob @Column(name = "JSON_ITEM_ATTR_SNAP", nullable = false) private String itemAttributeSnapshot;
    @Column(name = "HASH_ITEM_ATTR", nullable = false) private String itemAttributeHash;
    @Column(name = "DT_ITEM_ATTR_RESOLVED", nullable = false) private Instant itemAttributeResolvedAt;
    @Lob @Column(name = "JSON_STD_MAP_SNAP", nullable = false) private String standardMappingSnapshot;

    @Column(name = "ID_TNT", table = "RHN_EX_MED_REQ", nullable = false) private Long medicationTenantId;
    @Column(name = "ID_MED", table = "RHN_EX_MED_REQ", nullable = false) private Long medicationId;
    @Column(name = "QTY_DOSE_VAL", table = "RHN_EX_MED_REQ", precision = 28, scale = 8) private BigDecimal doseValue;
    @Column(name = "DOSE_UNIT", table = "RHN_EX_MED_REQ") private String doseUnit;
    @Column(name = "ID_CONCEPT_ROUTE", table = "RHN_EX_MED_REQ") private Long routeId;
    @Column(name = "CD_ROUTE", table = "RHN_EX_MED_REQ") private String routeCode;
    @Column(name = "NA_ROUTE_SNAP", table = "RHN_EX_MED_REQ") private String routeNameSnapshot;
    @Column(name = "SD_ROUTE_EXEC_TYPE_SNAP", table = "RHN_EX_MED_REQ") private String routeExecutionTypeSnapshot;
    @Column(name = "SD_ROUTE_RESOLUTION_STATUS", table = "RHN_EX_MED_REQ", nullable = false) private String routeResolutionStatus;
    @Column(name = "CD_FREQ", table = "RHN_EX_MED_REQ") private String frequencyCode;
    @Column(name = "ID_ORDER_FREQ", table = "RHN_EX_MED_REQ") private Long frequencyId;
    @Column(name = "NA_FREQ_SNAP", table = "RHN_EX_MED_REQ") private String frequencyNameSnapshot;
    @Lob @Column(name = "FREQUENCY_RULE_SNAPSHOT", table = "RHN_EX_MED_REQ") private String frequencyRuleSnapshot;
    @Column(name = "QTY_DURATION_VAL", table = "RHN_EX_MED_REQ", precision = 12, scale = 3) private BigDecimal durationValue;
    @Column(name = "DURATION_UNIT", table = "RHN_EX_MED_REQ") private String durationUnit;
    @Column(name = "QTY_ORDERED", table = "RHN_EX_MED_REQ", nullable = false, precision = 28, scale = 8) private BigDecimal quantity;
    @Column(name = "QTY_UNIT", table = "RHN_EX_MED_REQ", nullable = false) private String quantityUnit;
    @Column(name = "QTY_BASE", table = "RHN_EX_MED_REQ", nullable = false, precision = 28, scale = 8) private BigDecimal baseQuantity;
    @Column(name = "BASE_UNIT", table = "RHN_EX_MED_REQ", nullable = false) private String baseUnit;
    @Column(name = "PACKAGE_FACTOR_SNAPSHOT", table = "RHN_EX_MED_REQ", nullable = false, precision = 28, scale = 8) private BigDecimal packageFactorSnapshot;
    @Column(name = "NA_PKG_UNIT_SNAP", table = "RHN_EX_MED_REQ") private String packageUnitNameSnapshot;
    @Column(name = "PACKAGE_SPEC_SNAPSHOT", table = "RHN_EX_MED_REQ") private String packageSpecSnapshot;
    @Column(name = "PRICE_QUANTITY_SNAP", table = "RHN_EX_MED_REQ", precision = 28, scale = 8) private BigDecimal priceQuantitySnapshot;
    @Column(name = "FG_SUBSTITUTION", table = "RHN_EX_MED_REQ", nullable = false) private boolean substitutionAllowed;
    @Column(name = "FG_SELF_PROVIDED", table = "RHN_EX_MED_REQ", nullable = false) private boolean selfProvided;
    @Column(name = "DES_MED_INSTRUCTION", table = "RHN_EX_MED_REQ") private String medicationInstruction;
    @Column(name = "CD_MED_SNAP", table = "RHN_EX_MED_REQ", nullable = false) private String medicationCodeSnapshot;
    @Column(name = "NA_MED_SNAP", table = "RHN_EX_MED_REQ", nullable = false) private String medicationNameSnapshot;
    @Column(name = "SD_MED_TYPE_SNAP", table = "RHN_EX_MED_REQ", nullable = false) private String medicationTypeSnapshot;
    @Column(name = "DOSE_FORM_SNAPSHOT", table = "RHN_EX_MED_REQ") private String doseFormSnapshot;
    @Column(name = "PREPARATION_SPEC_SNAPSHOT", table = "RHN_EX_MED_REQ") private String preparationSpecSnapshot;
    @Column(name = "PREPARATION_UNIT_SNAPSHOT", table = "RHN_EX_MED_REQ") private String preparationUnitSnapshot;
    @Column(name = "FG_SKIN_TEST_REQUIRED_SNAP", table = "RHN_EX_MED_REQ", nullable = false) private boolean skinTestRequiredSnapshot;
    @Column(name = "FG_ANTIMICROBIAL_SNAP", table = "RHN_EX_MED_REQ", nullable = false) private boolean antimicrobialSnapshot;
    @Column(name = "SD_ANTIMICROBIAL_LEVEL_SNAP", table = "RHN_EX_MED_REQ") private String antimicrobialLevelSnapshot;
    @Lob @Column(name = "MEDICATION_SNAPSHOT", table = "RHN_EX_MED_REQ", nullable = false) private String medicationSnapshot;

    protected MedicationRequest() {}

    MedicationRequest(Long tenantId, Long residentId, Long encounterId, String requestNo,
                      Long requestGroupId, Long parentRequestId, String initialStatus,
                      Long catalogItemId, Long packageId, Long performerOrganizationId,
                      Long performerDepartmentId, LocalDate businessDate, Long authoredBy, String reasonText,
                      String itemCode, String itemName, String quantityUnit, String localCode, String localName,
                      Long adoptionId, Long adoptionRevision, Long priceId, Long priceRevision, String priceType,
                      BigDecimal unitPrice, BigDecimal totalAmount, String currencyCode,
                      String itemAttributeSnapshot, String itemAttributeHash, Instant itemAttributeResolvedAt,
                      String standardMappingSnapshot, Long medicationId, BigDecimal doseValue, String doseUnit,
                      Long routeId, String routeCode, String routeName, String routeExecutionType,
                      String frequencyCode, Long frequencyId, String frequencyName,
                      String frequencyRuleSnapshot, BigDecimal durationValue, String durationUnit,
                      BigDecimal quantity, BigDecimal baseQuantity, String baseUnit, BigDecimal packageFactor,
                      String packageUnitName, String packageSpec, BigDecimal priceQuantity,
                      boolean substitutionAllowed, boolean selfProvided, String medicationInstruction,
                      String medicationCode, String medicationName, String medicationType, String doseForm,
                      String preparationSpec, String preparationUnit, boolean skinTestRequired,
                      boolean antimicrobial, String antimicrobialLevel, String medicationSnapshot) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.medicationTenantId = tenantId;
        this.residentId = residentId; this.encounterId = encounterId; this.requestNo = requestNo;
        this.requestGroupId = requestGroupId; this.parentRequestId = parentRequestId;
        this.requestKind = "MEDICATION"; this.status = initialStatus;
        this.intentCode = "ORDER";
        this.priorityCode = "ROUTINE"; this.catalogItemId = catalogItemId; this.packageId = packageId;
        this.performerOrganizationId = performerOrganizationId; this.performerDepartmentId = performerDepartmentId;
        this.businessDate = businessDate; this.authoredAt = Instant.now(); this.authoredBy = authoredBy;
        this.reasonText = reasonText; this.itemCodeSnapshot = itemCode; this.itemNameSnapshot = itemName;
        this.unitCodeSnapshot = quantityUnit; this.localCodeSnapshot = localCode; this.localNameSnapshot = localName;
        this.adoptionId = adoptionId; this.adoptionRevision = adoptionRevision; this.priceId = priceId;
        this.priceRevision = priceRevision; this.priceType = priceType; this.unitPrice = unitPrice;
        this.totalAmount = totalAmount; this.currencyCode = currencyCode;
        this.itemAttributeSnapshot = itemAttributeSnapshot; this.itemAttributeHash = itemAttributeHash;
        this.itemAttributeResolvedAt = itemAttributeResolvedAt; this.standardMappingSnapshot = standardMappingSnapshot;
        this.medicationId = medicationId; this.doseValue = doseValue; this.doseUnit = doseUnit;
        this.routeId = routeId; this.routeCode = routeCode; this.routeNameSnapshot = routeName;
        this.routeExecutionTypeSnapshot = routeExecutionType;
        this.routeResolutionStatus = routeId == null ? "UNMAPPED" : "RESOLVED";
        this.frequencyCode = frequencyCode; this.frequencyId = frequencyId;
        this.frequencyNameSnapshot = frequencyName; this.frequencyRuleSnapshot = frequencyRuleSnapshot;
        this.durationValue = durationValue;
        this.durationUnit = durationUnit; this.quantity = quantity; this.quantityUnit = quantityUnit;
        this.baseQuantity = baseQuantity; this.baseUnit = baseUnit; this.packageFactorSnapshot = packageFactor;
        this.packageUnitNameSnapshot = packageUnitName; this.packageSpecSnapshot = packageSpec;
        this.priceQuantitySnapshot = priceQuantity; this.substitutionAllowed = substitutionAllowed;
        this.selfProvided = selfProvided; this.medicationInstruction = medicationInstruction;
        this.medicationCodeSnapshot = medicationCode; this.medicationNameSnapshot = medicationName;
        this.medicationTypeSnapshot = medicationType; this.doseFormSnapshot = doseForm;
        this.preparationSpecSnapshot = preparationSpec; this.preparationUnitSnapshot = preparationUnit;
        this.skinTestRequiredSnapshot = skinTestRequired; this.antimicrobialSnapshot = antimicrobial;
        this.antimicrobialLevelSnapshot = antimicrobialLevel; this.medicationSnapshot = medicationSnapshot;
    }

    void cancel(long expectedRevision, String reason, Long actorId) {
        if (revision != expectedRevision) throw new BusinessException("MEDICATION_REQUEST_REVISION_CONFLICT",
                "药品请求已被其他用户修改，请刷新后重试", HttpStatus.CONFLICT);
        if (!"ACTIVE".equals(status) && !"DRAFT".equals(status)) {
            throw new BusinessException("MEDICATION_REQUEST_STATE_INVALID",
                    "只有草稿或生效中的药品请求可以撤销", HttpStatus.CONFLICT);
        }
        status = "CANCELLED"; cancelledAt = Instant.now(); cancelledBy = actorId; cancelReason = reason;
    }

    void activateFromPrescription() {
        if (!"DRAFT".equals(status)) throw new BusinessException("MEDICATION_REQUEST_STATE_INVALID",
                "处方提交时只能激活草稿药品请求", HttpStatus.CONFLICT);
        status = "ACTIVE";
    }

    void cancelFromPrescription(String reason, Long actorId) {
        if ("CANCELLED".equals(status)) return;
        status = "CANCELLED"; cancelledAt = Instant.now(); cancelledBy = actorId; cancelReason = reason;
    }

    Long id() { return id; } long revision() { return revision; } Long tenantId() { return tenantId; }
    Long residentId() { return residentId; } Long encounterId() { return encounterId; } String requestNo() { return requestNo; }
    Long requestGroupId() { return requestGroupId; } Long parentRequestId() { return parentRequestId; }
    String status() { return status; } Long catalogItemId() { return catalogItemId; } Long medicationId() { return medicationId; }
    Long packageId() { return packageId; } Long performerOrganizationId() { return performerOrganizationId; }
    Long performerDepartmentId() { return performerDepartmentId; } LocalDate businessDate() { return businessDate; }
    Instant authoredAt() { return authoredAt; } Long authoredBy() { return authoredBy; } String reasonText() { return reasonText; }
    String itemCodeSnapshot() { return itemCodeSnapshot; } String itemNameSnapshot() { return itemNameSnapshot; }
    String localCodeSnapshot() { return localCodeSnapshot; } String localNameSnapshot() { return localNameSnapshot; }
    Long adoptionId() { return adoptionId; } Long adoptionRevision() { return adoptionRevision; }
    Long priceId() { return priceId; } Long priceRevision() { return priceRevision; } String priceType() { return priceType; }
    BigDecimal unitPrice() { return unitPrice; } BigDecimal totalAmount() { return totalAmount; } String currencyCode() { return currencyCode; }
    String itemAttributeSnapshot() { return itemAttributeSnapshot; } String itemAttributeHash() { return itemAttributeHash; }
    Instant itemAttributeResolvedAt() { return itemAttributeResolvedAt; } String standardMappingSnapshot() { return standardMappingSnapshot; }
    BigDecimal doseValue() { return doseValue; } String doseUnit() { return doseUnit; }
    Long routeId() { return routeId; } String routeCode() { return routeCode; }
    String routeNameSnapshot() { return routeNameSnapshot; }
    String routeExecutionTypeSnapshot() { return routeExecutionTypeSnapshot; }
    String frequencyCode() { return frequencyCode; } Long frequencyId() { return frequencyId; }
    String frequencyNameSnapshot() { return frequencyNameSnapshot; } String frequencyRuleSnapshot() { return frequencyRuleSnapshot; }
    BigDecimal durationValue() { return durationValue; }
    String durationUnit() { return durationUnit; } BigDecimal quantity() { return quantity; } String quantityUnit() { return quantityUnit; }
    BigDecimal baseQuantity() { return baseQuantity; } String baseUnit() { return baseUnit; }
    BigDecimal packageFactorSnapshot() { return packageFactorSnapshot; } String packageUnitNameSnapshot() { return packageUnitNameSnapshot; }
    String packageSpecSnapshot() { return packageSpecSnapshot; } BigDecimal priceQuantitySnapshot() { return priceQuantitySnapshot; }
    boolean substitutionAllowed() { return substitutionAllowed; } boolean selfProvided() { return selfProvided; }
    String medicationInstruction() { return medicationInstruction; } String medicationCodeSnapshot() { return medicationCodeSnapshot; }
    String medicationNameSnapshot() { return medicationNameSnapshot; } String medicationTypeSnapshot() { return medicationTypeSnapshot; }
    String doseFormSnapshot() { return doseFormSnapshot; } String preparationSpecSnapshot() { return preparationSpecSnapshot; }
    String preparationUnitSnapshot() { return preparationUnitSnapshot; } boolean skinTestRequiredSnapshot() { return skinTestRequiredSnapshot; }
    boolean antimicrobialSnapshot() { return antimicrobialSnapshot; } String antimicrobialLevelSnapshot() { return antimicrobialLevelSnapshot; }
    String medicationSnapshot() { return medicationSnapshot; } Instant cancelledAt() { return cancelledAt; }
    Long cancelledBy() { return cancelledBy; } String cancelReason() { return cancelReason; }
}
