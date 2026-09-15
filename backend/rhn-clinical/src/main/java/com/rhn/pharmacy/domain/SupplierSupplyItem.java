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
@Table(name = "RHN_SUP_SUPPL_SUPPLY_ITEM")
public class SupplierSupplyItem {
    @Id @Column(name = "ID_SUPPL_SUPPLY_ITEM") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_SUPPL", nullable = false) private Long supplierId;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "ID_ITEM_PKG", nullable = false) private Long packageId;
    @Column(name = "PRICE_AGREEMENT", precision = 24, scale = 6) private BigDecimal agreementPrice;
    @Column(name = "TAX_RATE", precision = 9, scale = 6) private BigDecimal taxRate;
    @Column(name = "FG_PURCH", nullable = false) private boolean purchaseEnabled;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate validFrom;
    @Column(name = "DA_VALID_TO") private LocalDate validTo;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

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
