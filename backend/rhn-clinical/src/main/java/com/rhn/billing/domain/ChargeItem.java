package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_BIL_CHARGE_ITEM")
public class ChargeItem {
    @Id @Column(name = "ID_CHARGE_ITEM") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "ID_PAT_ACCT", nullable = false) private Long patientAccountId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC") private Long encounterId;
    @Column(name = "ID_CARE_REQ") private Long requestId;
    @Column(name = "ID_CARE_EVT") private Long careEventId;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "SD_SRC_TYPE", nullable = false) private String sourceType;
    @Column(name = "ID_SRC", nullable = false) private Long sourceId;
    @Column(name = "CD_REQ", nullable = false) private String requestCode;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "QTY_CHARGE", nullable = false, precision = 28, scale = 8) private BigDecimal quantity;
    @Column(name = "CD_UNIT", nullable = false) private String unitCode;
    @Column(name = "PRICE_UNIT", nullable = false, precision = 24, scale = 6) private BigDecimal unitPrice;
    @Column(name = "AMT_TOTAL", nullable = false, precision = 24, scale = 6) private BigDecimal totalAmount;
    @Column(name = "CD_CCY", nullable = false) private String currencyCode;
    @Column(name = "ID_PRICE") private Long priceId;
    @Column(name = "SN_PRICE_VER") private Long priceRevision;
    @Column(name = "SD_PRICE_TYPE") private String priceType;
    @Column(name = "CD_ITEM_SNAP", nullable = false) private String itemCodeSnapshot;
    @Column(name = "NA_ITEM_SNAP", nullable = false) private String itemNameSnapshot;
    @Column(name = "DT_OCCRD", nullable = false) private Instant occurredAt;
    @Column(name = "ID_USER_ENTERED", nullable = false) private Long enteredBy;
    @Column(name = "ID_CHARGE_ITEM_RVRS") private Long reversesChargeItemId;

    protected ChargeItem() {}

    public ChargeItem(Long tenantId, Long patientAccountId, Long residentId, Long encounterId, Long requestId,
                      Long catalogItemId, String sourceType, Long sourceId, String requestCode,
                      BigDecimal quantity, String unitCode, BigDecimal unitPrice, BigDecimal totalAmount,
                      String currencyCode, Long priceId, Long priceRevision, String priceType,
                      String itemCodeSnapshot, String itemNameSnapshot, Instant occurredAt,
                      Long enteredBy, Long reversesChargeItemId) {
        this(tenantId, null, null, patientAccountId, residentId, encounterId, requestId,
                catalogItemId, sourceType, sourceId, requestCode, quantity, unitCode, unitPrice, totalAmount,
                currencyCode, priceId, priceRevision, priceType, itemCodeSnapshot, itemNameSnapshot, occurredAt,
                enteredBy, reversesChargeItemId);
    }

    public ChargeItem(Long tenantId, Long organizationId, Long departmentId,
                      Long patientAccountId, Long residentId, Long encounterId, Long requestId,
                      Long catalogItemId, String sourceType, Long sourceId, String requestCode,
                      BigDecimal quantity, String unitCode, BigDecimal unitPrice, BigDecimal totalAmount,
                      String currencyCode, Long priceId, Long priceRevision, String priceType,
                      String itemCodeSnapshot, String itemNameSnapshot, Instant occurredAt,
                      Long enteredBy, Long reversesChargeItemId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId;
        this.organizationId = organizationId; this.departmentId = departmentId;
        this.patientAccountId = patientAccountId;
        this.residentId = residentId; this.encounterId = encounterId; this.requestId = requestId;
        this.catalogItemId = catalogItemId; this.sourceType = sourceType; this.sourceId = sourceId;
        this.requestCode = requestCode; this.status = "POSTED"; this.quantity = quantity;
        this.unitCode = unitCode; this.unitPrice = unitPrice; this.totalAmount = totalAmount;
        this.currencyCode = currencyCode; this.priceId = priceId; this.priceRevision = priceRevision;
        this.priceType = priceType; this.itemCodeSnapshot = itemCodeSnapshot;
        this.itemNameSnapshot = itemNameSnapshot; this.occurredAt = occurredAt; this.enteredBy = enteredBy;
        this.reversesChargeItemId = reversesChargeItemId;
    }

    public void bindEncounter(Long encounterId) {
        if (this.encounterId != null && !this.encounterId.equals(encounterId)) {
            throw new IllegalStateException("收费事项已经绑定其他就诊");
        }
        this.encounterId = encounterId;
    }

    public void bindOrganizationAndDepartment(Long organizationId, Long departmentId) {
        if (this.organizationId == null) this.organizationId = organizationId;
        if (this.departmentId == null) this.departmentId = departmentId;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public Long patientAccountId() { return patientAccountId; }
    public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; }
    public Long requestId() { return requestId; }
    public Long catalogItemId() { return catalogItemId; }
    public String sourceType() { return sourceType; }
    public Long sourceId() { return sourceId; }
    public String requestCode() { return requestCode; }
    public String status() { return status; }
    public BigDecimal quantity() { return quantity; }
    public String unitCode() { return unitCode; }
    public BigDecimal unitPrice() { return unitPrice; }
    public BigDecimal totalAmount() { return totalAmount; }
    public String currencyCode() { return currencyCode; }
    public Long priceId() { return priceId; }
    public Long priceRevision() { return priceRevision; }
    public String priceType() { return priceType; }
    public String itemCodeSnapshot() { return itemCodeSnapshot; }
    public String itemNameSnapshot() { return itemNameSnapshot; }
    public Instant occurredAt() { return occurredAt; }
    public Long enteredBy() { return enteredBy; }
    public Long reversesChargeItemId() { return reversesChargeItemId; }
}
