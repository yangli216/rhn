package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "RHN_BD_ITEM_PKG")
public class ItemPackage {
    @Id @Column(name = "ID_ITEM_PKG") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "ID_ITEM_PKG_BASE") private Long basePackageId;
    @Column(name = "CD_UNIT", nullable = false) private String unitCode;
    @Column(name = "NA_UNIT", nullable = false) private String unitName;
    @Column(name = "PACKAGE_SPEC") private String packageSpec;
    @Column(name = "QTY_FACTOR", nullable = false) private BigDecimal quantityFactor;
    @Column(name = "SD_USAGE_TYPE") private String usageType;
    @Column(name = "CD_BARCODE") private String barcode;
    @Column(name = "FG_DEFAULT_PURCH", nullable = false) private boolean defaultPurchase;
    @Column(name = "FG_DEFAULT_SALE", nullable = false) private boolean defaultSale;
    @Column(name = "FG_DEFAULT_DISP", nullable = false) private boolean defaultDispense;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate validFrom;
    @Column(name = "DA_VALID_TO") private LocalDate validTo;

    protected ItemPackage() {}

    public ItemPackage(Long tenantId, Long catalogItemId, Long basePackageId, String unitCode, String unitName,
                       String packageSpec, BigDecimal quantityFactor, String usageType, String barcode,
                       boolean defaultPurchase, boolean defaultSale, boolean defaultDispense, String status,
                       LocalDate validFrom, LocalDate validTo) {
        if (quantityFactor == null || quantityFactor.signum() <= 0) throw new IllegalArgumentException("包装换算数量必须大于0");
        ServiceCatalogItem.requirePeriod(validFrom, validTo);
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.catalogItemId = catalogItemId;
        this.basePackageId = basePackageId; this.unitCode = unitCode; this.unitName = unitName;
        this.packageSpec = packageSpec; this.quantityFactor = quantityFactor; this.usageType = usageType;
        this.barcode = barcode; this.defaultPurchase = defaultPurchase; this.defaultSale = defaultSale;
        this.defaultDispense = defaultDispense; this.status = status; this.validFrom = validFrom; this.validTo = validTo;
    }

    public void update(Long basePackageId, String unitCode, String unitName, String packageSpec,
                       BigDecimal quantityFactor, String usageType, String barcode,
                       boolean defaultPurchase, boolean defaultSale, boolean defaultDispense, String status,
                       LocalDate validFrom, LocalDate validTo) {
        if (quantityFactor == null || quantityFactor.signum() <= 0) throw new IllegalArgumentException("包装换算数量必须大于0");
        ServiceCatalogItem.requirePeriod(validFrom, validTo);
        this.basePackageId = basePackageId; this.unitCode = unitCode; this.unitName = unitName;
        this.packageSpec = packageSpec; this.quantityFactor = quantityFactor; this.usageType = usageType;
        this.barcode = barcode; this.defaultPurchase = defaultPurchase; this.defaultSale = defaultSale;
        this.defaultDispense = defaultDispense; this.status = status; this.validFrom = validFrom; this.validTo = validTo;
    }

    public Long id() { return id; } public Long tenantId() { return tenantId; } public Long catalogItemId() { return catalogItemId; }
    public Long basePackageId() { return basePackageId; } public String unitCode() { return unitCode; }
    public String unitName() { return unitName; } public String packageSpec() { return packageSpec; }
    public BigDecimal quantityFactor() { return quantityFactor; } public String usageType() { return usageType; }
    public String barcode() { return barcode; } public boolean defaultPurchase() { return defaultPurchase; }
    public boolean defaultSale() { return defaultSale; } public boolean defaultDispense() { return defaultDispense; }
    public String status() { return status; } public LocalDate validFrom() { return validFrom; } public LocalDate validTo() { return validTo; }
}
