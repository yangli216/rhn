package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;

/** 检查阶梯计价档位：计费部位数落在 [siteFrom, siteTo] 时，主收费行收本档物价项 × chargeQuantity。 */
@Entity
@Table(name = "RHN_BD_EXAM_PRICE_TIER")
public class ExaminationPriceTier {
    @Id @Column(name = "ID_EXAM_PRICE_TIER") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "QTY_SITE_FROM", nullable = false) private int siteFrom;
    @Column(name = "QTY_SITE_TO") private Integer siteTo;
    @Column(name = "ID_CATALOG_ITEM_CHG", nullable = false) private Long chargeItemId;
    @Column(name = "QTY_CHG", nullable = false) private BigDecimal chargeQuantity;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;

    protected ExaminationPriceTier() {}

    public ExaminationPriceTier(Long tenantId, Long catalogItemId, int siteFrom, Integer siteTo,
                                Long chargeItemId, BigDecimal chargeQuantity, Long actorId) {
        if (siteFrom < 1) throw new IllegalArgumentException("档位计费部位数下限必须大于0");
        if (siteTo != null && siteTo < siteFrom) throw new IllegalArgumentException("档位上限不能小于下限");
        if (chargeQuantity == null || chargeQuantity.signum() <= 0) throw new IllegalArgumentException("档位收费数量必须大于0");
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.catalogItemId = catalogItemId;
        this.siteFrom = siteFrom;
        this.siteTo = siteTo;
        this.chargeItemId = chargeItemId;
        this.chargeQuantity = chargeQuantity;
        this.status = "ACTIVE";
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    public boolean covers(int chargeableSiteCount) {
        return chargeableSiteCount >= siteFrom && (siteTo == null || chargeableSiteCount <= siteTo);
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long catalogItemId() { return catalogItemId; }
    public int siteFrom() { return siteFrom; }
    public Integer siteTo() { return siteTo; }
    public Long chargeItemId() { return chargeItemId; }
    public BigDecimal chargeQuantity() { return chargeQuantity; }
    public String status() { return status; }
    public boolean active() { return "ACTIVE".equals(status); }
}
