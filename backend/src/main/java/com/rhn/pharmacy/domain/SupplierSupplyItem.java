package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "supplier_supply_items")
public class SupplierSupplyItem {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "supplier_id", nullable = false) private Long supplierId;
    @Column(name = "catalog_item_id", nullable = false) private Long catalogItemId;
    @Column(name = "package_id", nullable = false) private Long packageId;
    @Column(name = "agreement_price", precision = 24, scale = 6) private BigDecimal agreementPrice;
    @Column(name = "tax_rate", precision = 9, scale = 6) private BigDecimal taxRate;
    @Column(name = "purchase_enabled", nullable = false) private boolean purchaseEnabled;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected SupplierSupplyItem() {}

    public SupplierSupplyItem(Long tenantId, Long supplierId, Long catalogItemId, Long packageId,
                              BigDecimal agreementPrice, BigDecimal taxRate, LocalDate validFrom,
                              LocalDate validTo, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.supplierId = supplierId;
        this.catalogItemId = catalogItemId; this.packageId = packageId; this.agreementPrice = agreementPrice;
        this.taxRate = taxRate; this.purchaseEnabled = true; this.validFrom = validFrom; this.validTo = validTo;
        this.createdAt = Instant.now(); this.createdBy = actorId; this.updatedAt = createdAt; this.updatedBy = actorId;
    }

    public boolean effective(LocalDate date) {
        return purchaseEnabled && !date.isBefore(validFrom) && (validTo == null || !date.isAfter(validTo));
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long supplierId() { return supplierId; }
    public Long catalogItemId() { return catalogItemId; }
    public Long packageId() { return packageId; }
    public BigDecimal agreementPrice() { return agreementPrice; }
    public BigDecimal taxRate() { return taxRate; }
    public boolean purchaseEnabled() { return purchaseEnabled; }
    public LocalDate validFrom() { return validFrom; }
    public LocalDate validTo() { return validTo; }
}
