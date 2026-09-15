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
@Table(name = "RHN_BD_UNIT_CONV")
public class UnitConversion {
    @Id @Column(name = "ID_UNIT_CONV") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CATALOG_ITEM") private Long catalogItemId;
    @Column(name = "CD_SCOPE", nullable = false) private String scopeCode;
    @Column(name = "ID_UNIT_DEF_FROM_UNIT", nullable = false) private Long fromUnitId;
    @Column(name = "ID_UNIT_DEF_TO_UNIT", nullable = false) private Long toUnitId;
    @Column(name = "FACTOR", nullable = false) private BigDecimal factor;
    @Column(name = "OFFSET_VALUE", nullable = false) private BigDecimal offsetValue;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate validFrom;
    @Column(name = "DA_VALID_TO") private LocalDate validTo;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

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
