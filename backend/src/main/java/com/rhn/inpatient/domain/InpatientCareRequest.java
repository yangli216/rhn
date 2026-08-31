package com.rhn.inpatient.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import static com.rhn.shared.api.BusinessErrors.conflict;

/** Inpatient projection of the shared CareRequest aggregate. */
@Entity
@Table(name = "care_requests")
public class InpatientCareRequest {
    @Id private Long id;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "request_no", nullable = false) private String requestNo;
    @Column(name = "request_kind", nullable = false) private String requestKind;
    @Column(nullable = false) private String status;
    @Column(name = "catalog_item_id") private Long catalogItemId;
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
    @Column(name = "price_id") private Long priceId;
    @Column(name = "price_revision") private Long priceRevision;
    @Column(name = "price_type") private String priceType;
    @Column(name = "unit_price") private BigDecimal unitPrice;
    @Column(name = "total_amount") private BigDecimal totalAmount;
    @Column(name = "currency_code") private String currencyCode;

    protected InpatientCareRequest() {
    }

    public void activate() {
        if (!"DRAFT".equals(status)) throw conflict("INPATIENT_REQUEST_NOT_DRAFT", "共享医嘱事实不是草稿状态");
        this.status = "ACTIVE";
    }

    public void complete() {
        if (!"ACTIVE".equals(status)) throw conflict("INPATIENT_REQUEST_NOT_ACTIVE", "共享医嘱事实不是执行中状态");
        this.status = "COMPLETED";
    }

    public void cancel(Long actorId, String reason) {
        if (!"ACTIVE".equals(status)) throw conflict("INPATIENT_REQUEST_NOT_ACTIVE", "共享医嘱事实不是执行中状态");
        this.status = "CANCELLED";
        this.cancelledAt = Instant.now();
        this.cancelledBy = actorId;
        this.cancelReason = reason;
    }

    public String orderCategory() {
        return "CARE_ACTIVITY".equals(requestKind) ? "NURSING" : requestKind;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; }
    public String requestNo() { return requestNo; }
    public String requestKind() { return requestKind; }
    public String status() { return status; }
    public Long catalogItemId() { return catalogItemId; }
    public Long performerOrganizationId() { return performerOrganizationId; }
    public Long performerDepartmentId() { return performerDepartmentId; }
    public Instant authoredAt() { return authoredAt; }
    public Long authoredBy() { return authoredBy; }
    public String reasonText() { return reasonText; }
    public String itemCodeSnapshot() { return itemCodeSnapshot; }
    public String itemNameSnapshot() { return itemNameSnapshot; }
    public String unitCodeSnapshot() { return unitCodeSnapshot; }
    public Long priceId() { return priceId; }
    public Long priceRevision() { return priceRevision; }
    public String priceType() { return priceType; }
    public BigDecimal unitPrice() { return unitPrice; }
    public BigDecimal totalAmount() { return totalAmount; }
    public String currencyCode() { return currencyCode; }
}
