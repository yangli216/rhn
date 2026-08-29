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
@Table(name = "care_requests")
@SecondaryTable(name = "service_requests", pkJoinColumns = @PrimaryKeyJoinColumn(name = "request_id"))
class ServiceRequest {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "request_no", nullable = false) private String requestNo;
    @Column(name = "request_kind", nullable = false) private String requestKind;
    @Column(nullable = false) private String status;
    @Column(name = "intent_code", nullable = false) private String intentCode;
    @Column(name = "priority_code", nullable = false) private String priorityCode;
    @Column(name = "catalog_item_id", nullable = false) private Long catalogItemId;
    @Column(name = "package_id") private Long packageId;
    @Column(name = "performer_organization_id", nullable = false) private Long performerOrganizationId;
    @Column(name = "performer_department_id", nullable = false) private Long performerDepartmentId;
    @Column(name = "business_date", nullable = false) private LocalDate businessDate;
    @Column(name = "authored_at", nullable = false) private Instant authoredAt;
    @Column(name = "authored_by", nullable = false) private Long authoredBy;
    @Column(name = "reason_text") private String reasonText;
    @Column(name = "cancelled_at") private Instant cancelledAt;
    @Column(name = "cancelled_by") private Long cancelledBy;
    @Column(name = "cancel_reason") private String cancelReason;

    @Column(name = "item_code_snapshot", nullable = false) private String itemCodeSnapshot;
    @Column(name = "item_name_snapshot", nullable = false) private String itemNameSnapshot;
    @Column(name = "unit_code_snapshot", nullable = false) private String unitCodeSnapshot;
    @Column(name = "local_code_snapshot") private String localCodeSnapshot;
    @Column(name = "local_name_snapshot") private String localNameSnapshot;
    @Column(name = "adoption_id", nullable = false) private Long adoptionId;
    @Column(name = "adoption_revision", nullable = false) private long adoptionRevision;
    @Column(name = "price_id") private Long priceId;
    @Column(name = "price_revision") private Long priceRevision;
    @Column(name = "price_type") private String priceType;
    @Column(name = "unit_price", precision = 24, scale = 6) private BigDecimal unitPrice;
    @Column(name = "total_amount", precision = 24, scale = 6) private BigDecimal totalAmount;
    @Column(name = "currency_code") private String currencyCode;
    @Lob @Column(name = "item_attribute_snapshot", nullable = false) private String itemAttributeSnapshot;
    @Column(name = "item_attribute_hash", nullable = false) private String itemAttributeHash;
    @Column(name = "item_attribute_resolved_at", nullable = false) private Instant itemAttributeResolvedAt;
    @Lob @Column(name = "standard_mapping_snapshot", nullable = false) private String standardMappingSnapshot;

    @Column(table = "service_requests", name = "tenant_id", nullable = false) private Long serviceTenantId;
    @Column(table = "service_requests", name = "service_type_snapshot", nullable = false) private String serviceTypeSnapshot;
    @Column(table = "service_requests", name = "specimen_type_snapshot") private String specimenTypeSnapshot;
    @Column(table = "service_requests", name = "examination_type_snapshot") private String examinationTypeSnapshot;
    @Column(table = "service_requests", nullable = false, precision = 28, scale = 8) private BigDecimal quantity;
    @Column(table = "service_requests", name = "clinical_description") private String clinicalDescription;

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
    Long performerDepartmentId() { return performerDepartmentId; } LocalDate businessDate() { return businessDate; }
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
