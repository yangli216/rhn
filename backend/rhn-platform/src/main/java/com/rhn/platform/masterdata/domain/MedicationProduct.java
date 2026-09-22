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
@Table(name = "RHN_BD_CATALOG_ITEM")
@SecondaryTable(name = "RHN_BD_MED_PRODUCT", pkJoinColumns = @PrimaryKeyJoinColumn(name = "ID_CATALOG_ITEM"))
public class MedicationProduct {
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

    @Column(name = "ID_TNT", table = "RHN_BD_MED_PRODUCT", nullable = false) private Long productTenantId;
    @Column(name = "ID_MED", table = "RHN_BD_MED_PRODUCT", nullable = false) private Long medicationId;
    @Column(name = "ID_MFR", table = "RHN_BD_MED_PRODUCT", nullable = false) private Long manufacturerId;
    @Column(name = "NA_TRADE", table = "RHN_BD_MED_PRODUCT") private String tradeName;
    @Column(name = "CD_APRVL", table = "RHN_BD_MED_PRODUCT") private String approvalCode;
    @Column(name = "CD_TRACE", table = "RHN_BD_MED_PRODUCT") private String traceCode;
    @Column(name = "DA_APRVL_FROM", table = "RHN_BD_MED_PRODUCT") private LocalDate approvalFrom;
    @Column(name = "DA_APRVL_TO", table = "RHN_BD_MED_PRODUCT") private LocalDate approvalTo;
    @Column(name = "CD_REG", table = "RHN_BD_MED_PRODUCT") private String registrationCode;
    @Column(name = "DA_REG_FROM", table = "RHN_BD_MED_PRODUCT") private LocalDate registrationFrom;
    @Column(name = "DA_REG_TO", table = "RHN_BD_MED_PRODUCT") private LocalDate registrationTo;
    @Column(name = "CD_PURCH", table = "RHN_BD_MED_PRODUCT") private String purchaseCode;
    @Column(name = "SD_MARKET_STATUS", table = "RHN_BD_MED_PRODUCT") private String marketStatus;
    @Column(name = "PROD_PLACE", table = "RHN_BD_MED_PRODUCT") private String productionPlace;
    @Column(name = "FG_OTC", table = "RHN_BD_MED_PRODUCT", nullable = false) private boolean otc;
    @Column(name = "FG_CENTRAL_PURCH", table = "RHN_BD_MED_PRODUCT", nullable = false) private boolean centralPurchase;
    @Column(name = "FG_IMPORT", table = "RHN_BD_MED_PRODUCT", nullable = false) private boolean importAllowed;
    @Column(name = "FG_TRACE_SPLIT_RQD", table = "RHN_BD_MED_PRODUCT", nullable = false) private boolean traceSplitRequired;
    @Column(name = "QTY_SHELF_LIFE_VAL", table = "RHN_BD_MED_PRODUCT") private BigDecimal shelfLifeValue;
    @Column(name = "SHELF_LIFE_UNIT", table = "RHN_BD_MED_PRODUCT") private String shelfLifeUnit;
    @Column(name = "DES_INDIC", table = "RHN_BD_MED_PRODUCT") private String indication;
    @Column(name = "DES_INSTR", table = "RHN_BD_MED_PRODUCT") private String instruction;

    protected MedicationProduct() {}

    public MedicationProduct(Long tenantId, Long actorId, Long itemTypeId, Long medicationId, Long manufacturerId, String code,
                             String name, String unitCode, String tradeName, String approvalCode,
                             String traceCode, LocalDate approvalFrom, LocalDate approvalTo, String registrationCode,
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
        this.approvalCode = approvalCode; this.traceCode = traceCode;
        this.approvalFrom = approvalFrom; this.approvalTo = approvalTo;
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

    public void update(long expectedRevision, Long actorId, Long manufacturerId, String name, String unitCode,
                       String tradeName, String approvalCode, String traceCode, LocalDate approvalFrom,
                       LocalDate approvalTo, String registrationCode, LocalDate registrationFrom,
                       LocalDate registrationTo, String purchaseCode, String marketStatus, String productionPlace,
                       boolean otc, boolean centralPurchase, boolean importAllowed, boolean traceSplitRequired,
                       boolean orderable, boolean chargeable, boolean stocked, BigDecimal shelfLifeValue,
                       String shelfLifeUnit, String status, LocalDate validFrom, LocalDate validTo,
                       String indication, String instruction) {
        if (revision != expectedRevision) throw new IllegalStateException("药品产品已被其他用户修改，请刷新后重试");
        ServiceCatalogItem.requirePeriod(validFrom, validTo);
        ServiceCatalogItem.requirePeriod(approvalFrom == null ? LocalDate.MIN : approvalFrom, approvalTo);
        ServiceCatalogItem.requirePeriod(registrationFrom == null ? LocalDate.MIN : registrationFrom, registrationTo);
        if (shelfLifeValue != null && shelfLifeValue.signum() <= 0) {
            throw new IllegalArgumentException("产品有效期必须大于0");
        }
        this.manufacturerId = manufacturerId; this.name = name; this.unitCode = unitCode;
        this.tradeName = tradeName; this.approvalCode = approvalCode; this.traceCode = traceCode;
        this.approvalFrom = approvalFrom; this.approvalTo = approvalTo;
        this.registrationCode = registrationCode; this.registrationFrom = registrationFrom;
        this.registrationTo = registrationTo; this.purchaseCode = purchaseCode;
        this.marketStatus = marketStatus; this.productionPlace = productionPlace; this.otc = otc;
        this.centralPurchase = centralPurchase; this.importAllowed = importAllowed;
        this.traceSplitRequired = traceSplitRequired; this.orderable = orderable; this.chargeable = chargeable;
        this.stocked = stocked; this.shelfLifeValue = shelfLifeValue; this.shelfLifeUnit = shelfLifeUnit;
        this.status = status; this.validFrom = validFrom; this.validTo = validTo;
        this.indication = indication; this.instruction = instruction;
        this.updatedAt = Instant.now(); this.updatedBy = actorId;
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
    public String traceCode() { return traceCode; }
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
