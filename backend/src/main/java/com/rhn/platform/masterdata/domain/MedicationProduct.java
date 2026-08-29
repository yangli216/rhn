package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrimaryKeyJoinColumn;
import jakarta.persistence.SecondaryTable;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "catalog_items")
@SecondaryTable(name = "medication_products", pkJoinColumns = @PrimaryKeyJoinColumn(name = "catalog_item_id"))
public class MedicationProduct {
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

    @Column(table = "medication_products", name = "tenant_id", nullable = false) private Long productTenantId;
    @Column(table = "medication_products", name = "medication_id", nullable = false) private Long medicationId;
    @Column(table = "medication_products", name = "manufacturer_id", nullable = false) private Long manufacturerId;
    @Column(table = "medication_products", name = "trade_name") private String tradeName;
    @Column(table = "medication_products", name = "approval_code") private String approvalCode;
    @Column(table = "medication_products", name = "approval_from") private LocalDate approvalFrom;
    @Column(table = "medication_products", name = "approval_to") private LocalDate approvalTo;
    @Column(table = "medication_products", name = "registration_code") private String registrationCode;
    @Column(table = "medication_products", name = "registration_from") private LocalDate registrationFrom;
    @Column(table = "medication_products", name = "registration_to") private LocalDate registrationTo;
    @Column(table = "medication_products", name = "purchase_code") private String purchaseCode;
    @Column(table = "medication_products", name = "market_status") private String marketStatus;
    @Column(table = "medication_products", name = "production_place") private String productionPlace;
    @Column(table = "medication_products", nullable = false) private boolean otc;
    @Column(table = "medication_products", name = "central_purchase", nullable = false) private boolean centralPurchase;
    @Column(table = "medication_products", name = "import_allowed", nullable = false) private boolean importAllowed;
    @Column(table = "medication_products", name = "trace_split_required", nullable = false) private boolean traceSplitRequired;
    @Column(table = "medication_products", name = "shelf_life_value") private BigDecimal shelfLifeValue;
    @Column(table = "medication_products", name = "shelf_life_unit") private String shelfLifeUnit;
    @Column(table = "medication_products") private String indication;
    @Column(table = "medication_products") private String instruction;

    protected MedicationProduct() {}

    public MedicationProduct(Long tenantId, Long actorId, Long itemTypeId, Long medicationId, Long manufacturerId, String code,
                             String name, String unitCode, String tradeName, String approvalCode,
                             LocalDate approvalFrom, LocalDate approvalTo, String registrationCode,
                             LocalDate registrationFrom, LocalDate registrationTo, String purchaseCode,
                             String marketStatus, String productionPlace, boolean otc, boolean centralPurchase,
                             boolean importAllowed, boolean traceSplitRequired, boolean orderable,
                             boolean chargeable, boolean stocked, BigDecimal shelfLifeValue,
                             String shelfLifeUnit, String status, LocalDate validFrom, LocalDate validTo,
                             String indication, String instruction) {
        ServiceCatalogItem.requirePeriod(validFrom, validTo);
        ServiceCatalogItem.requirePeriod(approvalFrom == null ? LocalDate.MIN : approvalFrom, approvalTo);
        ServiceCatalogItem.requirePeriod(registrationFrom == null ? LocalDate.MIN : registrationFrom, registrationTo);
        if (shelfLifeValue != null && shelfLifeValue.signum() <= 0) {
            throw new IllegalArgumentException("产品有效期必须大于0");
        }
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.productTenantId = tenantId;
        this.itemTypeId = itemTypeId;
        this.medicationId = medicationId; this.manufacturerId = manufacturerId; this.code = code; this.name = name;
        this.itemType = "MED_PRODUCT"; this.unitCode = unitCode; this.tradeName = tradeName;
        this.approvalCode = approvalCode; this.approvalFrom = approvalFrom; this.approvalTo = approvalTo;
        this.registrationCode = registrationCode; this.registrationFrom = registrationFrom;
        this.registrationTo = registrationTo; this.purchaseCode = purchaseCode;
        this.marketStatus = marketStatus; this.productionPlace = productionPlace; this.otc = otc;
        this.centralPurchase = centralPurchase; this.importAllowed = importAllowed;
        this.traceSplitRequired = traceSplitRequired; this.shelfLifeValue = shelfLifeValue;
        this.shelfLifeUnit = shelfLifeUnit;
        this.orderable = orderable; this.chargeable = chargeable; this.stocked = stocked; this.status = status;
        this.validFrom = validFrom; this.validTo = validTo; this.indication = indication; this.instruction = instruction;
        this.createdAt = Instant.now(); this.createdBy = actorId; this.updatedAt = this.createdAt; this.updatedBy = actorId;
    }

    public void changeStatus(long expectedRevision, Long actorId, String status) {
        if (revision != expectedRevision) throw new IllegalStateException("药品产品已被其他用户修改，请刷新后重试");
        this.status = status; this.updatedAt = Instant.now(); this.updatedBy = actorId;
    }

    public Long id() { return id; } public long revision() { return revision; } public Long tenantId() { return tenantId; }
    public Long itemTypeId() { return itemTypeId; } public Long itemMasterId() { return itemMasterId; }
    public Long medicationId() { return medicationId; } public Long manufacturerId() { return manufacturerId; }
    public String code() { return code; } public String name() { return name; } public String unitCode() { return unitCode; }
    public String tradeName() { return tradeName; } public String approvalCode() { return approvalCode; }
    public LocalDate approvalFrom() { return approvalFrom; } public LocalDate approvalTo() { return approvalTo; }
    public String registrationCode() { return registrationCode; }
    public LocalDate registrationFrom() { return registrationFrom; } public LocalDate registrationTo() { return registrationTo; }
    public String purchaseCode() { return purchaseCode; } public String marketStatus() { return marketStatus; }
    public String productionPlace() { return productionPlace; } public boolean otc() { return otc; }
    public boolean centralPurchase() { return centralPurchase; } public boolean importAllowed() { return importAllowed; }
    public boolean traceSplitRequired() { return traceSplitRequired; } public boolean orderable() { return orderable; }
    public boolean chargeable() { return chargeable; } public boolean stocked() { return stocked; }
    public BigDecimal shelfLifeValue() { return shelfLifeValue; } public String shelfLifeUnit() { return shelfLifeUnit; }
    public String status() { return status; } public LocalDate validFrom() { return validFrom; }
    public LocalDate validTo() { return validTo; } public String indication() { return indication; }
    public String instruction() { return instruction; }
}
