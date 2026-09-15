package com.rhn.platform.masterdata.domain;

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
@Table(name = "RHN_BD_CATALOG_PRICE")
public class CatalogPrice {
    @Id @Column(name = "ID_CATALOG_PRICE") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "ID_ORG") private Long organizationId;
    @Column(name = "ID_ITEM_PKG") private Long packageId;
    @Column(name = "SD_PRICE_TYPE", nullable = false) private String priceType;
    @Column(name = "PRICE_UNIT", nullable = false) private BigDecimal price;
    @Column(name = "CD_CURRENCY", nullable = false) private String currencyCode;
    @Column(name = "CD_PRICE_DOC") private String priceDocumentCode;
    @Column(name = "DES_PRICE_REASON") private String priceReason;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate validFrom;
    @Column(name = "DA_VALID_TO") private LocalDate validTo;
    @Column(name = "ID_CATALOG_PRICE_REPLACES") private Long replacesPriceId;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;

    protected CatalogPrice() {}

    public CatalogPrice(Long tenantId, Long actorId, Long catalogItemId, Long organizationId, Long packageId,
                        String priceType, BigDecimal price, String currencyCode, String priceDocumentCode,
                        String priceReason, LocalDate validFrom, LocalDate validTo, String status) {
        this(tenantId, actorId, catalogItemId, organizationId, packageId, priceType, price, currencyCode,
                priceDocumentCode, priceReason, validFrom, validTo, status, null);
    }

    public CatalogPrice(Long tenantId, Long actorId, Long catalogItemId, Long organizationId, Long packageId,
                        String priceType, BigDecimal price, String currencyCode, String priceDocumentCode,
                        String priceReason, LocalDate validFrom, LocalDate validTo, String status,
                        Long replacesPriceId) {
        if (price == null || price.signum() < 0) throw new IllegalArgumentException("价格不能小于0");
        ServiceCatalogItem.requirePeriod(validFrom, validTo);
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.catalogItemId = catalogItemId;
        this.organizationId = organizationId; this.packageId = packageId; this.priceType = priceType;
        this.price = price; this.currencyCode = currencyCode; this.priceDocumentCode = priceDocumentCode;
        this.priceReason = priceReason; this.validFrom = validFrom; this.validTo = validTo; this.status = status;
        this.replacesPriceId = replacesPriceId;
        this.createdAt = Instant.now(); this.createdBy = actorId; this.updatedAt = this.createdAt; this.updatedBy = actorId;
    }

    public void replace(long expectedRevision, LocalDate successorFrom, Long actorId) {
        requireRevision(expectedRevision);
        if (!successorFrom.isAfter(validFrom)) throw new IllegalArgumentException("调价生效日期必须晚于原价格生效日期");
        LocalDate end = successorFrom.minusDays(1);
        if (validTo != null && validTo.isBefore(end)) throw new IllegalArgumentException("调价日期与原价格有效期不连续");
        validTo = end; status = "REPLACED"; touch(actorId);
    }

    public void changeStatus(long expectedRevision, String nextStatus, LocalDate endDate, Long actorId) {
        requireRevision(expectedRevision);
        if (!java.util.Set.of("ACTIVE", "SUSPENDED", "RETIRED").contains(nextStatus)) {
            throw new IllegalArgumentException("价格状态不正确");
        }
        if ("RETIRED".equals(nextStatus)) {
            if (endDate == null || endDate.isBefore(validFrom)) throw new IllegalArgumentException("停用日期不能早于生效日期");
            validTo = endDate;
        }
        status = nextStatus; touch(actorId);
    }

    public boolean sameScope(Long organizationId, Long packageId, String priceType) {
        return java.util.Objects.equals(this.organizationId, organizationId)
                && java.util.Objects.equals(this.packageId, packageId) && this.priceType.equals(priceType);
    }

    public boolean overlaps(LocalDate from, LocalDate to) {
        return (validTo == null || !validTo.isBefore(from)) && (to == null || !to.isBefore(validFrom));
    }

    public boolean effectiveAt(LocalDate date) {
        return !"SUSPENDED".equals(status) && !validFrom.isAfter(date) && (validTo == null || !validTo.isBefore(date));
    }

    private void requireRevision(long expected) {
        if (revision != expected) throw new IllegalStateException("价格已被其他用户修改，请刷新后重试");
    }

    private void touch(Long actorId) { updatedAt = Instant.now(); updatedBy = actorId; }

    public Long id() { return id; } public long revision() { return revision; } public Long catalogItemId() { return catalogItemId; }
    public Long organizationId() { return organizationId; } public Long packageId() { return packageId; }
    public String priceType() { return priceType; } public BigDecimal price() { return price; }
    public String currencyCode() { return currencyCode; } public String priceDocumentCode() { return priceDocumentCode; }
    public String priceReason() { return priceReason; } public LocalDate validFrom() { return validFrom; }
    public LocalDate validTo() { return validTo; } public String status() { return status; }
    public Long replacesPriceId() { return replacesPriceId; }
}
