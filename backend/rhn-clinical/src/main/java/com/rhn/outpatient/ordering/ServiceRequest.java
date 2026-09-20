package com.rhn.outpatient.ordering;

import com.rhn.shared.api.BusinessException;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.PrimaryKeyJoinColumn;
import jakarta.persistence.SecondaryTable;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "RHN_EX_CARE_REQ")
@SecondaryTable(name = "RHN_EX_SVC_REQ", pkJoinColumns = @PrimaryKeyJoinColumn(name = "ID_CARE_REQ"))
class ServiceRequest {
    @Id @Column(name = "ID_CARE_REQ") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "CD_REQ_NO", nullable = false) private String requestNo;
    @Column(name = "SD_REQ_KIND", nullable = false) private String requestKind;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "CD_INTENT", nullable = false) private String intentCode;
    @Column(name = "CD_PRIORITY", nullable = false) private String priorityCode;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "ID_ITEM_PKG") private Long packageId;
    @Column(name = "ID_ORG_EXEC", nullable = false) private Long performerOrganizationId;
    @Column(name = "ID_DEPT_EXEC", nullable = false) private Long performerDepartmentId;
    @Column(name = "ID_ORG_REQ", nullable = false) private Long requestingOrganizationId;
    @Column(name = "ID_DEPT_REQ", nullable = false) private Long requestingDepartmentId;
    @Column(name = "DA_BUSINESS", nullable = false) private LocalDate businessDate;
    @Column(name = "DT_AUTHORED", nullable = false) private Instant authoredAt;
    @Column(name = "ID_USER_AUTHORED", nullable = false) private Long authoredBy;
    @Column(name = "DES_REASON") private String reasonText;
    @Column(name = "DT_CANCELLED") private Instant cancelledAt;
    @Column(name = "ID_USER_CANCELLED") private Long cancelledBy;
    @Column(name = "DES_CANCEL_REASON") private String cancelReason;

    @Column(name = "CD_ITEM_SNAP", nullable = false) private String itemCodeSnapshot;
    @Column(name = "NA_ITEM_SNAP", nullable = false) private String itemNameSnapshot;
    @Column(name = "CD_UNIT_SNAP", nullable = false) private String unitCodeSnapshot;
    @Column(name = "CD_LOCAL_SNAP") private String localCodeSnapshot;
    @Column(name = "NA_LOCAL_SNAP") private String localNameSnapshot;
    @Column(name = "ID_ORG_CATALOG_ITEM_ADOPTION", nullable = false) private Long adoptionId;
    @Column(name = "SN_ADOPTION_VER", nullable = false) private long adoptionRevision;
    @Column(name = "ID_CATALOG_PRICE") private Long priceId;
    @Column(name = "SN_PRICE_VER") private Long priceRevision;
    @Column(name = "SD_PRICE_TYPE") private String priceType;
    @Column(name = "PRICE_UNIT", precision = 24, scale = 6) private BigDecimal unitPrice;
    @Column(name = "AMT_TOTAL", precision = 24, scale = 6) private BigDecimal totalAmount;
    @Column(name = "CD_CURRENCY") private String currencyCode;
    @Lob @Column(name = "JSON_ITEM_ATTR_SNAP", nullable = false) private String itemAttributeSnapshot;
    @Column(name = "HASH_ITEM_ATTR", nullable = false) private String itemAttributeHash;
    @Column(name = "DT_ITEM_ATTR_RESOLVED", nullable = false) private Instant itemAttributeResolvedAt;
    @Lob @Column(name = "JSON_STD_MAP_SNAP", nullable = false) private String standardMappingSnapshot;

    @Column(name = "ID_TNT", table = "RHN_EX_SVC_REQ", nullable = false) private Long serviceTenantId;
    @Column(name = "SD_SVC_TYPE_SNAP", table = "RHN_EX_SVC_REQ", nullable = false) private String serviceTypeSnapshot;
    @Column(name = "SD_SPEC_TYPE_SNAP", table = "RHN_EX_SVC_REQ") private String specimenTypeSnapshot;
    @Column(name = "SD_EXAM_TYPE_SNAP", table = "RHN_EX_SVC_REQ") private String examinationTypeSnapshot;
    @Column(name = "QTY_ORDERED", table = "RHN_EX_SVC_REQ", nullable = false, precision = 28, scale = 8) private BigDecimal quantity;
    @Column(name = "DES_CLIN_DESCRIPTION", table = "RHN_EX_SVC_REQ") private String clinicalDescription;

    @jakarta.persistence.Lob @Column(name = "JSON_DOC_INFO") private String documentInfoJson;

    String documentInfoJson() { return documentInfoJson; }
    void updateDocumentInfo(long expectedRevision, String json) {
        if (revision != expectedRevision) throw new BusinessException("SERVICE_REQUEST_REVISION_CONFLICT",
                "申请单已被其他用户修改，请刷新后重试", HttpStatus.CONFLICT);
        if (!"ACTIVE".equals(status)) throw new BusinessException("SERVICE_REQUEST_STATE_INVALID", "当前申请单不能修改", HttpStatus.CONFLICT);
        documentInfoJson = json;
    }

    protected ServiceRequest() {}

    ServiceRequest(Long tenantId, Long residentId, Long encounterId, String requestNo,
                   Long catalogItemId, Long packageId, Long performerOrganizationId,
                   Long performerDepartmentId, LocalDate businessDate, Long authoredBy, String reasonText,
                   String itemCodeSnapshot, String itemNameSnapshot, String unitCodeSnapshot,
                   String localCodeSnapshot, String localNameSnapshot, Long adoptionId, long adoptionRevision,
                   Long priceId, Long priceRevision, String priceType, BigDecimal unitPrice,
                   BigDecimal totalAmount, String currencyCode, String itemAttributeSnapshot,
                   String itemAttributeHash, Instant itemAttributeResolvedAt, String standardMappingSnapshot,
                   String serviceTypeSnapshot, String specimenTypeSnapshot, String examinationTypeSnapshot,
                   BigDecimal quantity, String clinicalDescription) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.serviceTenantId = tenantId;
        this.serviceTypeSnapshot = serviceTypeSnapshot;
        this.specimenTypeSnapshot = specimenTypeSnapshot;
        this.examinationTypeSnapshot = examinationTypeSnapshot;
        this.residentId = residentId;
        this.encounterId = encounterId;
        this.requestNo = requestNo;
        this.requestKind = "SERVICE";
        this.status = "ACTIVE";
        this.intentCode = "ORDER";
        this.priorityCode = "ROUTINE";
        this.catalogItemId = catalogItemId;
        this.packageId = packageId;
        this.performerOrganizationId = performerOrganizationId;
        this.performerDepartmentId = performerDepartmentId;
        this.requestingOrganizationId = performerOrganizationId;
        this.requestingDepartmentId = performerDepartmentId;
        this.businessDate = businessDate;
        this.authoredAt = Instant.now();
        this.authoredBy = authoredBy;
        this.reasonText = reasonText;
        this.itemCodeSnapshot = itemCodeSnapshot;
        this.itemNameSnapshot = itemNameSnapshot;
        this.unitCodeSnapshot = unitCodeSnapshot;
        this.localCodeSnapshot = localCodeSnapshot;
        this.localNameSnapshot = localNameSnapshot;
        this.adoptionId = adoptionId;
        this.adoptionRevision = adoptionRevision;
        this.priceId = priceId;
        this.priceRevision = priceRevision;
        this.priceType = priceType;
        this.unitPrice = unitPrice;
        this.totalAmount = totalAmount;
        this.currencyCode = currencyCode;
        this.itemAttributeSnapshot = itemAttributeSnapshot;
        this.itemAttributeHash = itemAttributeHash;
        this.itemAttributeResolvedAt = itemAttributeResolvedAt;
        this.standardMappingSnapshot = standardMappingSnapshot;
        this.quantity = quantity;
        this.clinicalDescription = clinicalDescription;
    }

    void cancel(long expectedRevision, String reason, Long actorId) {
        if (revision != expectedRevision) {
            throw new BusinessException("SERVICE_REQUEST_REVISION_CONFLICT", "诊疗请求已被其他用户修改，请刷新后重试", HttpStatus.CONFLICT);
        }
        if (!"ACTIVE".equals(status)) {
            throw new BusinessException("SERVICE_REQUEST_STATE_INVALID", "只有生效中的诊疗请求可以撤销", HttpStatus.CONFLICT);
        }
        status = "CANCELLED";
        cancelledAt = Instant.now();
        cancelledBy = actorId;
        cancelReason = reason;
    }

    Long id() { return id; } long revision() { return revision; } Long tenantId() { return tenantId; }
    Long residentId() { return residentId; } Long encounterId() { return encounterId; }
    String requestNo() { return requestNo; } String status() { return status; }
    Long catalogItemId() { return catalogItemId; } Long packageId() { return packageId; }
    Long performerOrganizationId() { return performerOrganizationId; }
    Long performerDepartmentId() { return performerDepartmentId; }
    Long requestingOrganizationId() { return requestingOrganizationId; }
    Long requestingDepartmentId() { return requestingDepartmentId; }
    LocalDate businessDate() { return businessDate; }
    Instant authoredAt() { return authoredAt; } Long authoredBy() { return authoredBy; } String reasonText() { return reasonText; }
    Instant cancelledAt() { return cancelledAt; } Long cancelledBy() { return cancelledBy; } String cancelReason() { return cancelReason; }
    String itemCodeSnapshot() { return itemCodeSnapshot; } String itemNameSnapshot() { return itemNameSnapshot; }
    String unitCodeSnapshot() { return unitCodeSnapshot; } String localCodeSnapshot() { return localCodeSnapshot; }
    String localNameSnapshot() { return localNameSnapshot; } Long adoptionId() { return adoptionId; }
    long adoptionRevision() { return adoptionRevision; } Long priceId() { return priceId; }
    Long priceRevision() { return priceRevision; } String priceType() { return priceType; }
    BigDecimal unitPrice() { return unitPrice; } BigDecimal totalAmount() { return totalAmount; }
    String currencyCode() { return currencyCode; } String itemAttributeSnapshot() { return itemAttributeSnapshot; }
    String itemAttributeHash() { return itemAttributeHash; } Instant itemAttributeResolvedAt() { return itemAttributeResolvedAt; }
    String standardMappingSnapshot() { return standardMappingSnapshot; } BigDecimal quantity() { return quantity; }
    String clinicalDescription() { return clinicalDescription; }
    String serviceTypeSnapshot() { return serviceTypeSnapshot; }
    String specimenTypeSnapshot() { return specimenTypeSnapshot; }
    String examinationTypeSnapshot() { return examinationTypeSnapshot; }
}
