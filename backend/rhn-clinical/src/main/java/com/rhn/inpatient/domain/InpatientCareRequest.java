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
@Table(name = "RHN_EX_CARE_REQ")
public class InpatientCareRequest {
    @Id @Column(name = "ID_CARE_REQ") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "CD_REQ_NO", nullable = false) private String requestNo;
    @Column(name = "SD_REQ_KIND", nullable = false) private String requestKind;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "ID_CATALOG_ITEM") private Long catalogItemId;
    @Column(name = "ID_ORG_PERFORMER", nullable = false) private Long performerOrganizationId;
    @Column(name = "ID_DEPT_PERFORMER", nullable = false) private Long performerDepartmentId;
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
    @Column(name = "ID_CATALOG_PRICE") private Long priceId;
    @Column(name = "SN_PRICE_VER") private Long priceRevision;
    @Column(name = "SD_PRICE_TYPE") private String priceType;
    @Column(name = "PRICE_UNIT") private BigDecimal unitPrice;
    @Column(name = "AMT_TOTAL") private BigDecimal totalAmount;
    @Column(name = "CD_CURRENCY") private String currencyCode;

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
