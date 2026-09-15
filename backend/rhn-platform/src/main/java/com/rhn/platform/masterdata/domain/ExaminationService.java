package com.rhn.platform.masterdata.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.math.BigDecimal;

@Entity
@Table(name = "RHN_BD_EXAM_SVC")
public class ExaminationService {
    @Id @Column(name = "ID_CATALOG_ITEM") private Long catalogItemId;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "SD_EXAM_TYPE") private String examinationType;
    @Column(name = "FG_BODY_SITE_REQUIRED", nullable = false) private boolean bodySiteRequired;
    @Column(name = "FG_MULTI_BODY_SITE", nullable = false) private boolean multiBodySite;
    @Column(name = "QTY_MAX_BODY_SITE") private Integer maxBodySiteCount;
    @Column(name = "DES_PREPARATION_DESCRIPTION") private String preparationDescription;
    @Column(name = "SD_SITE_PRICING_MODE", nullable = false) private String sitePricingMode;
    @Column(name = "QTY_INCLUDED_SITE", nullable = false) private int includedSiteCount;
    @Column(name = "PRICE_ADDL_SITE") private BigDecimal additionalSitePrice;
    @Column(name = "ID_CATALOG_ITEM_ADDL_SITE") private Long additionalSiteItemId;
    @Column(name = "QTY_ADDL_SITE", nullable = false) private BigDecimal additionalSiteQuantity;
    @Column(name = "QTY_MAX_CHARGEABLE_SITE") private Integer maxChargeableSiteCount;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;

    protected ExaminationService() {}

    public ExaminationService(Long tenantId, Long catalogItemId, String examinationType,
                              Integer maxBodySiteCount, String preparationDescription) {
        this(tenantId, catalogItemId, examinationType, maxBodySiteCount != null,
                maxBodySiteCount != null && maxBodySiteCount > 1, maxBodySiteCount,
                preparationDescription, null);
    }

    public ExaminationService(Long tenantId, Long catalogItemId, String examinationType,
                              boolean bodySiteRequired, boolean multiBodySite, Integer maxBodySiteCount,
                              String preparationDescription, Long actorId) {
        this.tenantId = tenantId;
        this.catalogItemId = catalogItemId;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        updateValues(examinationType, bodySiteRequired, multiBodySite, maxBodySiteCount,
                preparationDescription, "SINGLE", 1, null, null, BigDecimal.ONE,
                maxBodySiteCount, actorId);
    }

    public void synchronizeLegacy(String examinationType, Integer maxBodySiteCount,
                                  String preparationDescription) {
        if (this.examinationType == null) this.examinationType = examinationType;
        if (this.maxBodySiteCount == null) {
            this.maxBodySiteCount = maxBodySiteCount;
            this.multiBodySite = maxBodySiteCount != null && maxBodySiteCount > 1;
            this.bodySiteRequired = maxBodySiteCount != null;
        }
        if (this.preparationDescription == null) this.preparationDescription = preparationDescription;
    }

    public void synchronizeLegacyPricing(BigDecimal multiSitePrice, Integer freeSiteCount,
                                         Integer maxBodySiteCount) {
        if (multiSitePrice != null && ("SINGLE".equals(sitePricingMode) || "BASE_PLUS_FIXED".equals(sitePricingMode))) {
            this.sitePricingMode = "BASE_PLUS_FIXED";
            this.includedSiteCount = freeSiteCount == null ? 1 : freeSiteCount;
            this.additionalSitePrice = multiSitePrice;
            this.additionalSiteItemId = null;
            this.additionalSiteQuantity = BigDecimal.ONE;
            this.maxChargeableSiteCount = maxBodySiteCount;
        } else if (multiSitePrice == null && "BASE_PLUS_FIXED".equals(sitePricingMode)) {
            this.sitePricingMode = "SINGLE";
            this.includedSiteCount = 1;
            this.additionalSitePrice = null;
            this.maxChargeableSiteCount = maxBodySiteCount;
        }
    }

    public void update(long expectedRevision, String examinationType, boolean bodySiteRequired,
                       boolean multiBodySite, Integer maxBodySiteCount,
                       String preparationDescription, Long actorId) {
        update(expectedRevision, examinationType, bodySiteRequired, multiBodySite, maxBodySiteCount,
                preparationDescription, sitePricingMode, includedSiteCount, additionalSitePrice,
                additionalSiteItemId, additionalSiteQuantity, maxChargeableSiteCount, actorId);
    }

    public void update(long expectedRevision, String examinationType, boolean bodySiteRequired,
                       boolean multiBodySite, Integer maxBodySiteCount, String preparationDescription,
                       String sitePricingMode, int includedSiteCount, BigDecimal additionalSitePrice,
                       Long additionalSiteItemId, BigDecimal additionalSiteQuantity,
                       Integer maxChargeableSiteCount, Long actorId) {
        requireRevision(expectedRevision);
        updateValues(examinationType, bodySiteRequired, multiBodySite, maxBodySiteCount,
                preparationDescription, sitePricingMode, includedSiteCount, additionalSitePrice,
                additionalSiteItemId, additionalSiteQuantity, maxChargeableSiteCount, actorId);
    }

    private void updateValues(String examinationType, boolean bodySiteRequired,
                              boolean multiBodySite, Integer maxBodySiteCount,
                              String preparationDescription, String sitePricingMode,
                              int includedSiteCount, BigDecimal additionalSitePrice,
                              Long additionalSiteItemId, BigDecimal additionalSiteQuantity,
                              Integer maxChargeableSiteCount, Long actorId) {
        if (!bodySiteRequired && (multiBodySite || maxBodySiteCount != null)) {
            throw new IllegalArgumentException("不要求检查部位时不能配置多部位规则");
        }
        if (bodySiteRequired && (maxBodySiteCount == null || maxBodySiteCount <= 0)) {
            throw new IllegalArgumentException("要求检查部位时必须填写最大部位数");
        }
        if (!multiBodySite && maxBodySiteCount != null && maxBodySiteCount > 1) {
            throw new IllegalArgumentException("单部位检查的最大部位数不能大于1");
        }
        if (includedSiteCount < 1) throw new IllegalArgumentException("计价包含部位数必须大于0");
        if (additionalSitePrice != null && additionalSitePrice.signum() < 0) {
            throw new IllegalArgumentException("多部位固定加收金额不能小于0");
        }
        if (additionalSiteQuantity == null || additionalSiteQuantity.signum() <= 0) {
            throw new IllegalArgumentException("多部位加收数量必须大于0");
        }
        if (maxChargeableSiteCount != null && maxChargeableSiteCount < includedSiteCount) {
            throw new IllegalArgumentException("最大计费部位数不能小于包含部位数");
        }
        this.examinationType = examinationType;
        this.bodySiteRequired = bodySiteRequired;
        this.multiBodySite = multiBodySite;
        this.maxBodySiteCount = maxBodySiteCount;
        this.preparationDescription = preparationDescription;
        this.sitePricingMode = sitePricingMode;
        this.includedSiteCount = includedSiteCount;
        this.additionalSitePrice = additionalSitePrice;
        this.additionalSiteItemId = additionalSiteItemId;
        this.additionalSiteQuantity = additionalSiteQuantity;
        this.maxChargeableSiteCount = maxChargeableSiteCount;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public Long catalogItemId() { return catalogItemId; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public String examinationType() { return examinationType; }
    public boolean bodySiteRequired() { return bodySiteRequired; }
    public boolean multiBodySite() { return multiBodySite; }
    public Integer maxBodySiteCount() { return maxBodySiteCount; }
    public String preparationDescription() { return preparationDescription; }
    public String sitePricingMode() { return sitePricingMode; }
    public int includedSiteCount() { return includedSiteCount; }
    public BigDecimal additionalSitePrice() { return additionalSitePrice; }
    public Long additionalSiteItemId() { return additionalSiteItemId; }
    public BigDecimal additionalSiteQuantity() { return additionalSiteQuantity; }
    public Integer maxChargeableSiteCount() { return maxChargeableSiteCount; }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw new IllegalStateException("检查项目配置已被其他用户修改，请刷新后重试");
    }
}
