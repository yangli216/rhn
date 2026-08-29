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
@Table(name = "unit_conversions")
public class UnitConversion {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "catalog_item_id") private Long catalogItemId;
    @Column(name = "scope_code", nullable = false) private String scopeCode;
    @Column(name = "from_unit_id", nullable = false) private Long fromUnitId;
    @Column(name = "to_unit_id", nullable = false) private Long toUnitId;
    @Column(nullable = false) private BigDecimal factor;
    @Column(name = "offset_value", nullable = false) private BigDecimal offsetValue;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected UnitConversion() {}

    public UnitConversion(Long tenantId, Long actorId, Long catalogItemId, Long fromUnitId,
                          Long toUnitId, BigDecimal factor, BigDecimal offsetValue,
                          LocalDate validFrom, LocalDate validTo, String status) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.catalogItemId = catalogItemId;
        this.scopeCode = catalogItemId == null ? "GLOBAL" : "ITEM:" + catalogItemId;
        this.fromUnitId = fromUnitId; this.toUnitId = toUnitId;
        this.createdAt = Instant.now(); this.createdBy = actorId;
        updateValues(actorId, factor, offsetValue, validFrom, validTo, status);
    }

    public void update(long expectedRevision, Long actorId, BigDecimal factor, BigDecimal offsetValue,
                       LocalDate validFrom, LocalDate validTo, String status) {
        requireRevision(expectedRevision); updateValues(actorId, factor, offsetValue, validFrom, validTo, status);
    }

    public void changeStatus(long expectedRevision, Long actorId, String status) {
        requireRevision(expectedRevision); this.status = status; this.updatedAt = Instant.now(); this.updatedBy = actorId;
    }

    private void updateValues(Long actorId, BigDecimal factor, BigDecimal offsetValue,
                              LocalDate validFrom, LocalDate validTo, String status) {
        if (fromUnitId.equals(toUnitId)) throw new IllegalArgumentException("换算的来源和目标单位不能相同");
        if (factor == null || factor.signum() <= 0) throw new IllegalArgumentException("换算因子必须大于0");
        ServiceCatalogItem.requirePeriod(validFrom, validTo);
        this.factor = factor; this.offsetValue = offsetValue == null ? BigDecimal.ZERO : offsetValue;
        this.validFrom = validFrom; this.validTo = validTo; this.status = status;
        this.updatedAt = Instant.now(); this.updatedBy = actorId;
    }
    private void requireRevision(long expected) { if (revision != expected) throw new IllegalStateException("单位换算已被其他用户修改，请刷新后重试"); }
    public boolean effective(LocalDate date) { return "ACTIVE".equals(status) && !date.isBefore(validFrom) && (validTo == null || !date.isAfter(validTo)); }

    public Long id() { return id; } public long revision() { return revision; } public Long catalogItemId() { return catalogItemId; }
    public String scopeCode() { return scopeCode; } public Long fromUnitId() { return fromUnitId; } public Long toUnitId() { return toUnitId; }
    public BigDecimal factor() { return factor; } public BigDecimal offsetValue() { return offsetValue; }
    public LocalDate validFrom() { return validFrom; } public LocalDate validTo() { return validTo; } public String status() { return status; }
}
