package com.rhn.outpatient.template;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "RHN_META_OP_PLAN_DIAG")
class OutpatientPlanDiagnosis {
    @Id @Column(name = "ID_OP_PLAN_DIAG") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_OP_PLAN_TMPL", nullable = false) private Long templateId;
    @Column(name = "SN_LINE", nullable = false) private int lineNo;
    @Column(name = "CD_DIAG", nullable = false) private String code;
    @Column(name = "NA_DIAG", nullable = false) private String name;
    @Column(name = "SD_DIAG_TYPE", nullable = false) private String type;

    protected OutpatientPlanDiagnosis() {}
    OutpatientPlanDiagnosis(Long tenantId, Long templateId, int lineNo, String code, String name, String type) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.templateId = templateId;
        this.lineNo = lineNo; this.code = code; this.name = name; this.type = type;
    }
    Long templateId() { return templateId; } int lineNo() { return lineNo; } String code() { return code; }
    String name() { return name; } String type() { return type; }
}

@Entity
@Table(name = "RHN_META_OP_PLAN_MED")
class OutpatientPlanMedication {
    @Id @Column(name = "ID_OP_PLAN_MED") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_OP_PLAN_TMPL", nullable = false) private Long templateId;
    @Column(name = "SN_LINE", nullable = false) private int lineNo;
    @Column(name = "ID_MED", nullable = false) private Long medicationId;
    @Column(name = "ID_CATALOG_ITEM") private Long catalogItemId;
    @Column(name = "ID_PKG") private Long packageId;
    @Column(name = "CD_CAT", nullable = false) private String categoryCode;
    @Column(name = "CD_MED", nullable = false) private String medicationCode;
    @Column(name = "NA_MED", nullable = false) private String medicationName;
    @Column(name = "PREP_SPEC") private String preparationSpec;
    @Column(name = "NA_PRODUCT") private String productName;
    @Column(name = "QTY_DOSE_VAL") private BigDecimal doseValue;
    @Column(name = "DOSE_UNIT") private String doseUnit;
    @Column(name = "CD_ROUTE") private String routeCode;
    @Column(name = "CD_FREQ") private String frequencyCode;
    @Column(name = "QTY_DUR_VAL") private BigDecimal durationValue;
    @Column(name = "DUR_UNIT") private String durationUnit;
    @Column(name = "QTY_ORDERED", nullable = false) private BigDecimal quantity;
    @Column(name = "QTY_UNIT") private String quantityUnit;
    @Column(name = "FG_SUBSTN", nullable = false) private boolean substitutionAllowed;
    @Column(name = "FG_SELF_PRVDD", nullable = false) private boolean selfProvided;
    @Column(name = "DES_MED_INSTR") private String medicationInstruction;
    @Column(name = "SD_PRICE_TYPE") private String priceType;
    @Column(name = "FG_PRICING_RQD", nullable = false) private boolean pricingRequired;
    @Column(name = "DES_REASON") private String reason;

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
    Long id() { return id; } Long templateId() { return templateId; } int lineNo() { return lineNo; }
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
@Table(name = "RHN_META_OP_PLAN_SVC")
class OutpatientPlanServiceLine {
    @Id @Column(name = "ID_OP_PLAN_SVC") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_OP_PLAN_TMPL", nullable = false) private Long templateId;
    @Column(name = "SN_LINE", nullable = false) private int lineNo;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "CD_ITEM", nullable = false) private String itemCode;
    @Column(name = "NA_ITEM", nullable = false) private String itemName;
    @Column(name = "SD_SVC_TYPE", nullable = false) private String serviceType;
    @Column(name = "QTY_ORDERED", nullable = false) private BigDecimal quantity;
    @Column(name = "CD_UNIT") private String unitCode;
    @Column(name = "SD_PRICE_TYPE") private String priceType;
    @Column(name = "FG_PRICING_RQD", nullable = false) private boolean pricingRequired;
    @Column(name = "DES_REASON") private String reason;
    @Column(name = "DES_CLIN_DESCR") private String clinicalDescription;

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
