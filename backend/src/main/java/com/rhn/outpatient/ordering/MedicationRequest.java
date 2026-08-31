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
@Table(name = "care_requests")
@SecondaryTable(name = "medication_requests", pkJoinColumns = @PrimaryKeyJoinColumn(name = "request_id"))
class MedicationRequest {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "request_no", nullable = false) private String requestNo;
    @Column(name = "request_group_id") private Long requestGroupId;
    @Column(name = "parent_request_id") private Long parentRequestId;
    @Column(name = "request_kind", nullable = false) private String requestKind;
    @Column(nullable = false) private String status;
    @Column(name = "intent_code", nullable = false) private String intentCode;
    @Column(name = "priority_code", nullable = false) private String priorityCode;
    @Column(name = "catalog_item_id") private Long catalogItemId;
    @Column(name = "package_id") private Long packageId;
    @Column(name = "performer_organization_id", nullable = false) private Long performerOrganizationId;
    @Column(name = "performer_department_id", nullable = false) private Long performerDepartmentId;
    @Column(name = "business_date", nullable = false) private LocalDate businessDate;
    @Column(name = "authored_at", nullable = false) private Instant authoredAt;
    @Column(name = "authored_by", nullable = false) private Long authoredBy;
    @Column(name = "reason_text") private String reasonText;
    @Column(name = "cancelled_at") private Instant cancelledAt;
    @Column(name = "cancelled_by") private Long cancelledBy;
    @Column(name = "cancel_reason") private String cancelReason;
    @Column(name = "item_code_snapshot", nullable = false) private String itemCodeSnapshot;
    @Column(name = "item_name_snapshot", nullable = false) private String itemNameSnapshot;
    @Column(name = "unit_code_snapshot", nullable = false) private String unitCodeSnapshot;
    @Column(name = "local_code_snapshot") private String localCodeSnapshot;
    @Column(name = "local_name_snapshot") private String localNameSnapshot;
    @Column(name = "adoption_id") private Long adoptionId;
    @Column(name = "adoption_revision") private Long adoptionRevision;
    @Column(name = "price_id") private Long priceId;
    @Column(name = "price_revision") private Long priceRevision;
    @Column(name = "price_type") private String priceType;
    @Column(name = "unit_price", precision = 24, scale = 6) private BigDecimal unitPrice;
    @Column(name = "total_amount", precision = 24, scale = 6) private BigDecimal totalAmount;
    @Column(name = "currency_code") private String currencyCode;
    @Lob @Column(name = "item_attribute_snapshot", nullable = false) private String itemAttributeSnapshot;
    @Column(name = "item_attribute_hash", nullable = false) private String itemAttributeHash;
    @Column(name = "item_attribute_resolved_at", nullable = false) private Instant itemAttributeResolvedAt;
    @Lob @Column(name = "standard_mapping_snapshot", nullable = false) private String standardMappingSnapshot;

    @Column(table = "medication_requests", name = "tenant_id", nullable = false) private Long medicationTenantId;
    @Column(table = "medication_requests", name = "medication_id", nullable = false) private Long medicationId;
    @Column(table = "medication_requests", name = "dose_value", precision = 28, scale = 8) private BigDecimal doseValue;
    @Column(table = "medication_requests", name = "dose_unit") private String doseUnit;
    @Column(table = "medication_requests", name = "route_code") private String routeCode;
    @Column(table = "medication_requests", name = "frequency_code") private String frequencyCode;
    @Column(table = "medication_requests", name = "frequency_id") private Long frequencyId;
    @Column(table = "medication_requests", name = "frequency_name_snapshot") private String frequencyNameSnapshot;
    @Lob @Column(table = "medication_requests", name = "frequency_rule_snapshot") private String frequencyRuleSnapshot;
    @Column(table = "medication_requests", name = "duration_value", precision = 12, scale = 3) private BigDecimal durationValue;
    @Column(table = "medication_requests", name = "duration_unit") private String durationUnit;
    @Column(table = "medication_requests", nullable = false, precision = 28, scale = 8) private BigDecimal quantity;
    @Column(table = "medication_requests", name = "quantity_unit", nullable = false) private String quantityUnit;
    @Column(table = "medication_requests", name = "base_quantity", nullable = false, precision = 28, scale = 8) private BigDecimal baseQuantity;
    @Column(table = "medication_requests", name = "base_unit", nullable = false) private String baseUnit;
    @Column(table = "medication_requests", name = "package_factor_snapshot", nullable = false, precision = 28, scale = 8) private BigDecimal packageFactorSnapshot;
    @Column(table = "medication_requests", name = "package_unit_name_snapshot") private String packageUnitNameSnapshot;
    @Column(table = "medication_requests", name = "package_spec_snapshot") private String packageSpecSnapshot;
    @Column(table = "medication_requests", name = "price_quantity_snapshot", precision = 28, scale = 8) private BigDecimal priceQuantitySnapshot;
    @Column(table = "medication_requests", name = "substitution_allowed", nullable = false) private boolean substitutionAllowed;
    @Column(table = "medication_requests", name = "self_provided", nullable = false) private boolean selfProvided;
    @Column(table = "medication_requests", name = "medication_instruction") private String medicationInstruction;
    @Column(table = "medication_requests", name = "medication_code_snapshot", nullable = false) private String medicationCodeSnapshot;
    @Column(table = "medication_requests", name = "medication_name_snapshot", nullable = false) private String medicationNameSnapshot;
    @Column(table = "medication_requests", name = "medication_type_snapshot", nullable = false) private String medicationTypeSnapshot;
    @Column(table = "medication_requests", name = "dose_form_snapshot") private String doseFormSnapshot;
    @Column(table = "medication_requests", name = "preparation_spec_snapshot") private String preparationSpecSnapshot;
    @Column(table = "medication_requests", name = "preparation_unit_snapshot") private String preparationUnitSnapshot;
    @Column(table = "medication_requests", name = "skin_test_required_snapshot", nullable = false) private boolean skinTestRequiredSnapshot;
    @Column(table = "medication_requests", name = "antimicrobial_snapshot", nullable = false) private boolean antimicrobialSnapshot;
    @Column(table = "medication_requests", name = "antimicrobial_level_snapshot") private String antimicrobialLevelSnapshot;
    @Lob @Column(table = "medication_requests", name = "medication_snapshot", nullable = false) private String medicationSnapshot;

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
                      String routeCode, String frequencyCode, Long frequencyId, String frequencyName,
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
        this.routeCode = routeCode; this.frequencyCode = frequencyCode; this.frequencyId = frequencyId;
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
    BigDecimal doseValue() { return doseValue; } String doseUnit() { return doseUnit; } String routeCode() { return routeCode; }
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
