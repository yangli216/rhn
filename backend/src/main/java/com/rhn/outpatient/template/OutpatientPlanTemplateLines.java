package com.rhn.outpatient.template;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "outpatient_plan_diagnoses")
class OutpatientPlanDiagnosis {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "template_id", nullable = false) private Long templateId;
    @Column(name = "line_no", nullable = false) private int lineNo;
    @Column(name = "diagnosis_code", nullable = false) private String code;
    @Column(name = "diagnosis_name", nullable = false) private String name;
    @Column(name = "diagnosis_type", nullable = false) private String type;

    protected OutpatientPlanDiagnosis() {}
    OutpatientPlanDiagnosis(Long tenantId, Long templateId, int lineNo, String code, String name, String type) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.templateId = templateId;
        this.lineNo = lineNo; this.code = code; this.name = name; this.type = type;
    }
    Long templateId() { return templateId; } int lineNo() { return lineNo; } String code() { return code; }
    String name() { return name; } String type() { return type; }
}

@Entity
@Table(name = "outpatient_plan_medications")
class OutpatientPlanMedication {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "template_id", nullable = false) private Long templateId;
    @Column(name = "line_no", nullable = false) private int lineNo;
    @Column(name = "medication_id", nullable = false) private Long medicationId;
    @Column(name = "catalog_item_id") private Long catalogItemId;
    @Column(name = "package_id") private Long packageId;
    @Column(name = "category_code", nullable = false) private String categoryCode;
    @Column(name = "medication_code", nullable = false) private String medicationCode;
    @Column(name = "medication_name", nullable = false) private String medicationName;
    @Column(name = "preparation_spec") private String preparationSpec;
    @Column(name = "product_name") private String productName;
    @Column(name = "dose_value") private BigDecimal doseValue;
    @Column(name = "dose_unit") private String doseUnit;
    @Column(name = "route_code") private String routeCode;
    @Column(name = "frequency_code") private String frequencyCode;
    @Column(name = "duration_value") private BigDecimal durationValue;
    @Column(name = "duration_unit") private String durationUnit;
    @Column(nullable = false) private BigDecimal quantity;
    @Column(name = "quantity_unit") private String quantityUnit;
    @Column(name = "substitution_allowed", nullable = false) private boolean substitutionAllowed;
    @Column(name = "self_provided", nullable = false) private boolean selfProvided;
    @Column(name = "medication_instruction") private String medicationInstruction;
    @Column(name = "price_type") private String priceType;
    @Column(name = "pricing_required", nullable = false) private boolean pricingRequired;
    @Column(name = "reason_text") private String reason;

    protected OutpatientPlanMedication() {}
    OutpatientPlanMedication(Long tenantId, Long templateId, int lineNo, Long medicationId, Long catalogItemId,
                             Long packageId, String categoryCode, String medicationCode, String medicationName,
                             String preparationSpec, String productName, BigDecimal doseValue, String doseUnit,
                             String routeCode, String frequencyCode, BigDecimal durationValue, String durationUnit,
                             BigDecimal quantity, String quantityUnit, boolean substitutionAllowed,
                             boolean selfProvided, String medicationInstruction, String priceType,
                             boolean pricingRequired, String reason) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.templateId = templateId; this.lineNo = lineNo;
        this.medicationId = medicationId; this.catalogItemId = catalogItemId; this.packageId = packageId;
        this.categoryCode = categoryCode; this.medicationCode = medicationCode; this.medicationName = medicationName;
        this.preparationSpec = preparationSpec; this.productName = productName; this.doseValue = doseValue;
        this.doseUnit = doseUnit; this.routeCode = routeCode; this.frequencyCode = frequencyCode;
        this.durationValue = durationValue; this.durationUnit = durationUnit; this.quantity = quantity;
        this.quantityUnit = quantityUnit; this.substitutionAllowed = substitutionAllowed;
        this.selfProvided = selfProvided; this.medicationInstruction = medicationInstruction;
        this.priceType = priceType; this.pricingRequired = pricingRequired; this.reason = reason;
    }
    Long templateId() { return templateId; } int lineNo() { return lineNo; }
    Long medicationId() { return medicationId; } Long catalogItemId() { return catalogItemId; }
    Long packageId() { return packageId; } String categoryCode() { return categoryCode; }
    String medicationCode() { return medicationCode; } String medicationName() { return medicationName; }
    String preparationSpec() { return preparationSpec; } String productName() { return productName; }
    BigDecimal doseValue() { return doseValue; } String doseUnit() { return doseUnit; } String routeCode() { return routeCode; }
    String frequencyCode() { return frequencyCode; } BigDecimal durationValue() { return durationValue; }
    String durationUnit() { return durationUnit; } BigDecimal quantity() { return quantity; }
    String quantityUnit() { return quantityUnit; } boolean substitutionAllowed() { return substitutionAllowed; }
    boolean selfProvided() { return selfProvided; } String medicationInstruction() { return medicationInstruction; }
    String priceType() { return priceType; } boolean pricingRequired() { return pricingRequired; } String reason() { return reason; }
}

@Entity
@Table(name = "outpatient_plan_services")
class OutpatientPlanServiceLine {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "template_id", nullable = false) private Long templateId;
    @Column(name = "line_no", nullable = false) private int lineNo;
    @Column(name = "catalog_item_id", nullable = false) private Long catalogItemId;
    @Column(name = "item_code", nullable = false) private String itemCode;
    @Column(name = "item_name", nullable = false) private String itemName;
    @Column(name = "service_type", nullable = false) private String serviceType;
    @Column(nullable = false) private BigDecimal quantity;
    @Column(name = "unit_code") private String unitCode;
    @Column(name = "price_type") private String priceType;
    @Column(name = "pricing_required", nullable = false) private boolean pricingRequired;
    @Column(name = "reason_text") private String reason;
    @Column(name = "clinical_description") private String clinicalDescription;

    protected OutpatientPlanServiceLine() {}
    OutpatientPlanServiceLine(Long tenantId, Long templateId, int lineNo, Long catalogItemId,
                              String itemCode, String itemName, String serviceType, BigDecimal quantity,
                              String unitCode, String priceType, boolean pricingRequired, String reason,
                              String clinicalDescription) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.templateId = templateId; this.lineNo = lineNo;
        this.catalogItemId = catalogItemId; this.itemCode = itemCode; this.itemName = itemName;
        this.serviceType = serviceType; this.quantity = quantity; this.unitCode = unitCode;
        this.priceType = priceType; this.pricingRequired = pricingRequired; this.reason = reason;
        this.clinicalDescription = clinicalDescription;
    }
    Long templateId() { return templateId; } int lineNo() { return lineNo; }
    Long catalogItemId() { return catalogItemId; } String itemCode() { return itemCode; }
    String itemName() { return itemName; } String serviceType() { return serviceType; }
    BigDecimal quantity() { return quantity; } String unitCode() { return unitCode; } String priceType() { return priceType; }
    boolean pricingRequired() { return pricingRequired; } String reason() { return reason; }
    String clinicalDescription() { return clinicalDescription; }
}
