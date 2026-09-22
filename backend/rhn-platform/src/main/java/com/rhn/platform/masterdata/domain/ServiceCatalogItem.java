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
@SecondaryTable(name = "RHN_BD_SVC_ITEM", pkJoinColumns = @PrimaryKeyJoinColumn(name = "ID_CATALOG_ITEM"))
public class ServiceCatalogItem {
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

    @Column(name = "ID_TNT", table = "RHN_BD_SVC_ITEM", nullable = false) private Long serviceTenantId;
    @Column(name = "SD_SVC_TYPE", table = "RHN_BD_SVC_ITEM", nullable = false) private String serviceType;
    @Column(name = "SD_SVC_SUBTYPE", table = "RHN_BD_SVC_ITEM") private String serviceSubtype;
    @Column(name = "SD_USAGE_TYPE", table = "RHN_BD_SVC_ITEM", nullable = false) private String usageType;
    @Column(name = "FG_MEDICAL_TECH", table = "RHN_BD_SVC_ITEM", nullable = false) private boolean medicalTechnology;
    @Column(name = "FG_COMB_ITEM", table = "RHN_BD_SVC_ITEM", nullable = false) private boolean combinationItem;
    @Column(name = "FG_SINGLE_ORDER", table = "RHN_BD_SVC_ITEM", nullable = false) private boolean singleOrder;
    @Column(name = "SD_SPEC_TYPE", table = "RHN_BD_SVC_ITEM") private String specimenType;
    @Column(name = "SD_EXAM_TYPE", table = "RHN_BD_SVC_ITEM") private String examinationType;
    @Column(name = "SD_ACCTG_CAT", table = "RHN_BD_SVC_ITEM") private String accountingCategory;
    @Column(name = "SD_DUP_RULE", table = "RHN_BD_SVC_ITEM") private String duplicateRule;
    @Column(name = "PRICE_MULTI_SITE", table = "RHN_BD_SVC_ITEM") private BigDecimal multiSitePrice;
    @Column(name = "QTY_FREE_SITE", table = "RHN_BD_SVC_ITEM") private Integer freeSiteCount;
    @Column(name = "QTY_MAX_BODY_SITE", table = "RHN_BD_SVC_ITEM") private Integer maxBodySiteCount;
    @Column(name = "CD_MUTUAL_RECOG", table = "RHN_BD_SVC_ITEM") private String mutualRecognitionCode;
    @Column(name = "FG_PREG_ALERT", table = "RHN_BD_SVC_ITEM", nullable = false) private boolean pregnancyAlert;
    @Column(name = "DES_ATTN", table = "RHN_BD_SVC_ITEM") private String attention;
    @Column(name = "DES_EXAM_NOTE", table = "RHN_BD_SVC_ITEM") private String examinationNotes;

    protected ServiceCatalogItem() {}

    public ServiceCatalogItem(Long tenantId, Long actorId, Long itemTypeId, String code, String name, String unitCode,
                              boolean orderable, boolean chargeable, String status, LocalDate validFrom,
                              LocalDate validTo, String serviceType, String serviceSubtype, String usageType,
                              boolean medicalTechnology, boolean combinationItem, boolean singleOrder,
                              String specimenType, String examinationType, String accountingCategory,
                              String duplicateRule, BigDecimal multiSitePrice, Integer freeSiteCount,
                              Integer maxBodySiteCount, String mutualRecognitionCode,
                              boolean pregnancyAlert, String attention, String examinationNotes) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.itemTypeId = itemTypeId;
        this.serviceTenantId = tenantId;
        this.itemType = "SERVICE";
        this.stocked = false;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        updateValues(actorId, code, name, unitCode, orderable, chargeable, status, validFrom, validTo,
                serviceType, serviceSubtype, usageType, medicalTechnology, combinationItem, singleOrder,
                specimenType, examinationType, accountingCategory, duplicateRule, multiSitePrice, freeSiteCount,
                maxBodySiteCount, mutualRecognitionCode, pregnancyAlert, attention, examinationNotes);
    }

    public void update(long expectedRevision, Long actorId, Long itemTypeId, String name, String unitCode, boolean orderable,
                       boolean chargeable, String status, LocalDate validFrom, LocalDate validTo,
                       String serviceType, String serviceSubtype, String usageType, boolean medicalTechnology,
                       boolean combinationItem, boolean singleOrder, String specimenType, String examinationType,
                       String accountingCategory, String duplicateRule, BigDecimal multiSitePrice,
                       Integer freeSiteCount, Integer maxBodySiteCount, String mutualRecognitionCode,
                       boolean pregnancyAlert, String attention, String examinationNotes) {
        requireRevision(expectedRevision);
        this.itemTypeId = itemTypeId;
        updateValues(actorId, code, name, unitCode, orderable, chargeable, status, validFrom, validTo,
                serviceType, serviceSubtype, usageType, medicalTechnology, combinationItem, singleOrder,
                specimenType, examinationType, accountingCategory, duplicateRule, multiSitePrice, freeSiteCount,
                maxBodySiteCount, mutualRecognitionCode, pregnancyAlert, attention, examinationNotes);
    }

    public void changeStatus(long expectedRevision, Long actorId, String status) {
        requireRevision(expectedRevision);
        this.status = status;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    private void updateValues(Long actorId, String code, String name, String unitCode, boolean orderable,
                              boolean chargeable, String status, LocalDate validFrom, LocalDate validTo,
                              String serviceType, String serviceSubtype, String usageType, boolean medicalTechnology,
                              boolean combinationItem, boolean singleOrder, String specimenType, String examinationType,
                              String accountingCategory, String duplicateRule, BigDecimal multiSitePrice,
                              Integer freeSiteCount, Integer maxBodySiteCount, String mutualRecognitionCode,
                              boolean pregnancyAlert, String attention, String examinationNotes) {
        requirePeriod(validFrom, validTo);
        if (multiSitePrice != null && multiSitePrice.signum() < 0) {
            throw new IllegalArgumentException("多部位加收价格不能小于0");
        }
        if (freeSiteCount != null && freeSiteCount < 0) {
            throw new IllegalArgumentException("免费部位数不能小于0");
        }
        if (maxBodySiteCount != null && maxBodySiteCount <= 0) {
            throw new IllegalArgumentException("最大部位数必须大于0");
        }
        if (freeSiteCount != null && maxBodySiteCount != null && freeSiteCount > maxBodySiteCount) {
            throw new IllegalArgumentException("免费部位数不能大于最大部位数");
        }
        this.code = code; this.name = name; this.unitCode = unitCode; this.orderable = orderable;
        this.chargeable = chargeable; this.status = status; this.validFrom = validFrom; this.validTo = validTo;
        this.serviceType = serviceType; this.serviceSubtype = serviceSubtype; this.usageType = usageType;
        this.medicalTechnology = medicalTechnology; this.combinationItem = combinationItem;
        this.singleOrder = singleOrder; this.specimenType = specimenType; this.examinationType = examinationType;
        this.accountingCategory = accountingCategory; this.duplicateRule = duplicateRule;
        this.multiSitePrice = multiSitePrice; this.freeSiteCount = freeSiteCount;
        this.maxBodySiteCount = maxBodySiteCount; this.mutualRecognitionCode = mutualRecognitionCode;
        this.pregnancyAlert = pregnancyAlert;
        this.attention = attention; this.examinationNotes = examinationNotes;
        this.updatedAt = Instant.now(); this.updatedBy = actorId;
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw new IllegalStateException("诊疗项目已被其他用户修改，请刷新后重试");
    }
    static void requirePeriod(LocalDate from, LocalDate to) {
        if (to != null && to.isBefore(from)) throw new IllegalArgumentException("失效日期不能早于生效日期");
    }

    public Long id() { return id; } public long revision() { return revision; } public Long tenantId() { return tenantId; }
    public Long itemTypeId() { return itemTypeId; } public Long itemMasterId() { return itemMasterId; }
    public String code() { return code; } public String name() { return name; } public String unitCode() { return unitCode; }
    public boolean orderable() { return orderable; } public boolean chargeable() { return chargeable; }
    public String status() { return status; } public LocalDate validFrom() { return validFrom; } public LocalDate validTo() { return validTo; }
    public String serviceType() { return serviceType; } public String serviceSubtype() { return serviceSubtype; }
    public String usageType() { return usageType; } public boolean medicalTechnology() { return medicalTechnology; }
    public boolean combinationItem() { return combinationItem; } public boolean singleOrder() { return singleOrder; }
    public String specimenType() { return specimenType; } public String examinationType() { return examinationType; }
    public String accountingCategory() { return accountingCategory; } public String duplicateRule() { return duplicateRule; }
    public BigDecimal multiSitePrice() { return multiSitePrice; } public Integer freeSiteCount() { return freeSiteCount; }
    public Integer maxBodySiteCount() { return maxBodySiteCount; }
    public String mutualRecognitionCode() { return mutualRecognitionCode; }
    public boolean pregnancyAlert() { return pregnancyAlert; }
    public String attention() { return attention; } public String examinationNotes() { return examinationNotes; }
}
