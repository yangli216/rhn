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
@Table(name = "catalog_items")
@SecondaryTable(name = "service_items", pkJoinColumns = @PrimaryKeyJoinColumn(name = "catalog_item_id"))
public class ServiceCatalogItem {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "item_type_id", nullable = false) private Long itemTypeId;
    @Column(name = "item_master_id") private Long itemMasterId;
    @Column(nullable = false) private String code;
    @Column(nullable = false) private String name;
    @Column(name = "item_type", nullable = false) private String itemType;
    @Column(name = "unit_code") private String unitCode;
    @Column(nullable = false) private boolean orderable;
    @Column(nullable = false) private boolean chargeable;
    @Column(nullable = false) private boolean stocked;
    @Column(nullable = false) private String status;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by") private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by") private Long updatedBy;

    @Column(table = "service_items", name = "tenant_id", nullable = false) private Long serviceTenantId;
    @Column(table = "service_items", name = "service_type", nullable = false) private String serviceType;
    @Column(table = "service_items", name = "service_subtype") private String serviceSubtype;
    @Column(table = "service_items", name = "usage_type", nullable = false) private String usageType;
    @Column(table = "service_items", name = "medical_technology", nullable = false) private boolean medicalTechnology;
    @Column(table = "service_items", name = "combination_item", nullable = false) private boolean combinationItem;
    @Column(table = "service_items", name = "single_order", nullable = false) private boolean singleOrder;
    @Column(table = "service_items", name = "specimen_type") private String specimenType;
    @Column(table = "service_items", name = "examination_type") private String examinationType;
    @Column(table = "service_items", name = "accounting_category") private String accountingCategory;
    @Column(table = "service_items", name = "duplicate_rule") private String duplicateRule;
    @Column(table = "service_items", name = "multi_site_price") private BigDecimal multiSitePrice;
    @Column(table = "service_items", name = "free_site_count") private Integer freeSiteCount;
    @Column(table = "service_items", name = "max_body_site_count") private Integer maxBodySiteCount;
    @Column(table = "service_items", name = "mutual_recognition_code") private String mutualRecognitionCode;
    @Column(table = "service_items", name = "pregnancy_alert", nullable = false) private boolean pregnancyAlert;
    @Column(table = "service_items") private String attention;
    @Column(table = "service_items", name = "examination_notes") private String examinationNotes;

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
