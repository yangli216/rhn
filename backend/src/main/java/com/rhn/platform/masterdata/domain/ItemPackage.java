package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "item_packages")
public class ItemPackage {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "catalog_item_id", nullable = false) private Long catalogItemId;
    @Column(name = "base_package_id") private Long basePackageId;
    @Column(name = "unit_code", nullable = false) private String unitCode;
    @Column(name = "unit_name", nullable = false) private String unitName;
    @Column(name = "package_spec") private String packageSpec;
    @Column(name = "quantity_factor", nullable = false) private BigDecimal quantityFactor;
    @Column(name = "usage_type") private String usageType;
    private String barcode;
    @Column(name = "default_purchase", nullable = false) private boolean defaultPurchase;
    @Column(name = "default_sale", nullable = false) private boolean defaultSale;
    @Column(name = "default_dispense", nullable = false) private boolean defaultDispense;
    @Column(nullable = false) private String status;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;

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

    public Long id() { return id; } public Long tenantId() { return tenantId; } public Long catalogItemId() { return catalogItemId; }
    public Long basePackageId() { return basePackageId; } public String unitCode() { return unitCode; }
    public String unitName() { return unitName; } public String packageSpec() { return packageSpec; }
    public BigDecimal quantityFactor() { return quantityFactor; } public String usageType() { return usageType; }
    public String barcode() { return barcode; } public boolean defaultPurchase() { return defaultPurchase; }
    public boolean defaultSale() { return defaultSale; } public boolean defaultDispense() { return defaultDispense; }
    public String status() { return status; } public LocalDate validFrom() { return validFrom; } public LocalDate validTo() { return validTo; }
}
